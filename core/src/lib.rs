use std::cell::RefCell;

use wasm_bindgen::prelude::*;

pub mod culling;
pub mod hit_test;
pub mod instance;
pub mod seat_map;
pub mod spatial_index;

use culling::CullingScratch;
use hit_test::HitTestScratch;
use instance::{sanitize_state_flags, SeatInstance, SEAT_INSTANCE_STRIDE_BYTES};
use spatial_index::{Rect, SpatialIndex};

#[derive(Debug, Default, Clone)]
pub struct DirtyRanges {
    buffer: Vec<u32>,
}

impl DirtyRanges {
    pub fn reserve_for_count(&mut self, count: usize) {
        self.buffer.clear();
        let needed_words = count.saturating_mul(2);
        if self.buffer.capacity() < needed_words {
            self.buffer
                .reserve_exact(needed_words - self.buffer.capacity());
        }
    }

    pub fn mark(&mut self, start: u32, count: u32) {
        if count == 0 {
            return;
        }

        let mut new_start = u64::from(start);
        let mut new_end = new_start + u64::from(count);
        let mut i = 0usize;

        while i < self.buffer.len() {
            let range_start = u64::from(self.buffer[i]);
            let range_end = range_start + u64::from(self.buffer[i + 1]);

            if new_end < range_start {
                self.insert_pair(i, new_start as u32, (new_end - new_start) as u32);
                return;
            }

            if new_start > range_end {
                i += 2;
                continue;
            }

            new_start = new_start.min(range_start);
            new_end = new_end.max(range_end);
            self.buffer.drain(i..i + 2);
        }

        self.buffer
            .extend_from_slice(&[new_start as u32, (new_end - new_start) as u32]);
    }

    pub fn clear(&mut self) {
        self.buffer.clear();
    }

    pub fn as_words(&self) -> &[u32] {
        &self.buffer
    }

    pub fn range_count(&self) -> u32 {
        (self.buffer.len() / 2) as u32
    }

    fn insert_pair(&mut self, index: usize, start: u32, count: u32) {
        self.buffer.insert(index, start);
        self.buffer.insert(index + 1, count);
    }
}

#[derive(Debug, Default)]
pub struct LayoutCore {
    instances: Vec<SeatInstance>,
    load_buffer: Vec<u8>,
    state_update_index_buffer: Vec<u32>,
    index: SpatialIndex,
    culling: CullingScratch,
    hit_test: HitTestScratch,
    dirty_ranges: DirtyRanges,
}

impl LayoutCore {
    pub fn load_bytes(
        &mut self,
        instance_data: &[u8],
        count: u32,
    ) -> Result<(), seat_map::LoadError> {
        let instances = seat_map::load_instances_from_bytes(instance_data, count)?;
        self.replace_instances(instances);
        Ok(())
    }

    pub fn reserve_load_buffer(&mut self, byte_len: u32) -> u32 {
        self.load_buffer.resize(byte_len as usize, 0);
        self.load_buffer.as_mut_ptr() as usize as u32
    }

    pub fn load_from_staging_buffer(
        &mut self,
        byte_len: u32,
        count: u32,
    ) -> Result<(), seat_map::LoadError> {
        let byte_len = usize::try_from(byte_len).map_err(|_| seat_map::LoadError::CountTooLarge)?;
        if byte_len > self.load_buffer.len() {
            return Err(seat_map::LoadError::LengthMismatch {
                expected: byte_len,
                actual: self.load_buffer.len(),
            });
        }
        let instances = seat_map::load_instances_from_bytes(&self.load_buffer[..byte_len], count)?;
        self.replace_instances(instances);
        Ok(())
    }

    fn replace_instances(&mut self, instances: Vec<SeatInstance>) {
        self.instances = instances;
        self.index = SpatialIndex::build(&self.instances);
        let count = self.instances.len();
        self.culling.reserve_for_count(count);
        self.hit_test.reserve_for_count(count);
        self.dirty_ranges.reserve_for_count(count);
        self.dirty_ranges.mark(0, count as u32);
    }

    pub fn load_instances_for_test(&mut self, instances: Vec<SeatInstance>) {
        self.replace_instances(instances);
    }

    pub fn instance_buffer_ptr(&self) -> u32 {
        self.instances.as_ptr() as usize as u32
    }

    pub fn instance_count(&self) -> u32 {
        self.instances.len() as u32
    }

    pub fn query_viewport(&mut self, min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> u32 {
        culling::query_viewport(
            &self.instances,
            &self.index,
            &mut self.culling,
            Rect::new(min_x, min_y, max_x, max_y),
        )
    }

    pub fn hit_test(&mut self, x: f32, y: f32, radius: f32) -> i32 {
        hit_test::hit_test(
            &self.instances,
            &self.index,
            &mut self.hit_test,
            x,
            y,
            radius,
        )
    }

    pub fn set_state_flags(&mut self, index: u32, flags: u32) -> bool {
        let Some(instance) = self.instances.get_mut(index as usize) else {
            return false;
        };
        let flags = sanitize_state_flags(flags);
        if instance.state_flags != flags {
            instance.state_flags = flags;
            self.dirty_ranges.mark(index, 1);
        }
        true
    }

    pub fn set_state_flags_bulk(&mut self, indices: &[u32], flags: u32) -> u32 {
        let mut updated = 0u32;
        for &index in indices {
            if self.set_state_flags(index, flags) {
                updated += 1;
            }
        }
        updated
    }

    pub fn reserve_state_update_index_buffer(&mut self, count: u32) -> u32 {
        self.state_update_index_buffer.resize(count as usize, 0);
        self.state_update_index_buffer.as_mut_ptr() as usize as u32
    }

    pub fn set_state_flags_bulk_from_buffer(&mut self, count: u32, flags: u32) -> u32 {
        let count = (count as usize).min(self.state_update_index_buffer.len());
        let mut updated = 0u32;
        for i in 0..count {
            let index = self.state_update_index_buffer[i];
            if self.set_state_flags(index, flags) {
                updated += 1;
            }
        }
        updated
    }

    pub fn set_state_flags_range(&mut self, start: u32, count: u32, flags: u32) -> u32 {
        let end = start.saturating_add(count).min(self.instance_count());
        let mut updated = 0u32;
        for index in start..end {
            if self.set_state_flags(index, flags) {
                updated += 1;
            }
        }
        updated
    }

    pub fn set_color_index(&mut self, index: u32, color_index: u32) -> bool {
        let Some(instance) = self.instances.get_mut(index as usize) else {
            return false;
        };
        if instance.color_index != color_index {
            instance.color_index = color_index;
            self.dirty_ranges.mark(index, 1);
        }
        true
    }
}

thread_local! {
    static CORE: RefCell<LayoutCore> = RefCell::new(LayoutCore::default());
}

#[wasm_bindgen]
pub fn load(instance_data: &[u8], count: u32) -> Result<(), JsValue> {
    CORE.with(|core| {
        core.borrow_mut()
            .load_bytes(instance_data, count)
            .map_err(|error| JsValue::from_str(&error.to_string()))
    })
}

#[wasm_bindgen]
pub fn load_buffer_ptr(byte_len: u32) -> u32 {
    CORE.with(|core| core.borrow_mut().reserve_load_buffer(byte_len))
}

#[wasm_bindgen]
pub fn load_from_buffer(byte_len: u32, count: u32) -> Result<(), JsValue> {
    CORE.with(|core| {
        core.borrow_mut()
            .load_from_staging_buffer(byte_len, count)
            .map_err(|error| JsValue::from_str(&error.to_string()))
    })
}

#[wasm_bindgen]
pub fn instance_buffer_ptr() -> u32 {
    CORE.with(|core| core.borrow().instance_buffer_ptr())
}

#[wasm_bindgen]
pub fn instance_count() -> u32 {
    CORE.with(|core| core.borrow().instance_count())
}

#[wasm_bindgen]
pub fn instance_stride_bytes() -> u32 {
    SEAT_INSTANCE_STRIDE_BYTES as u32
}

#[wasm_bindgen]
pub fn query_viewport(min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> u32 {
    CORE.with(|core| core.borrow_mut().query_viewport(min_x, min_y, max_x, max_y))
}

#[wasm_bindgen]
pub fn visible_range_buffer_ptr() -> u32 {
    CORE.with(|core| core.borrow().culling.ranges().as_ptr() as usize as u32)
}

#[wasm_bindgen]
pub fn visible_range_buffer_len() -> u32 {
    CORE.with(|core| core.borrow().culling.ranges().len() as u32)
}

#[wasm_bindgen]
pub fn visible_range_count() -> u32 {
    CORE.with(|core| core.borrow().culling.range_count())
}

#[wasm_bindgen]
pub fn hit_test(x: f32, y: f32, radius: f32) -> i32 {
    CORE.with(|core| core.borrow_mut().hit_test(x, y, radius))
}

#[wasm_bindgen]
pub fn set_state_flags(index: u32, flags: u32) -> bool {
    CORE.with(|core| core.borrow_mut().set_state_flags(index, flags))
}

#[wasm_bindgen]
pub fn set_state_flags_bulk(indices: &[u32], flags: u32) -> u32 {
    CORE.with(|core| core.borrow_mut().set_state_flags_bulk(indices, flags))
}

#[wasm_bindgen]
pub fn state_update_index_buffer_ptr(count: u32) -> u32 {
    CORE.with(|core| core.borrow_mut().reserve_state_update_index_buffer(count))
}

#[wasm_bindgen]
pub fn set_state_flags_bulk_from_buffer(count: u32, flags: u32) -> u32 {
    CORE.with(|core| {
        core.borrow_mut()
            .set_state_flags_bulk_from_buffer(count, flags)
    })
}

#[wasm_bindgen]
pub fn set_state_flags_range(start: u32, count: u32, flags: u32) -> u32 {
    CORE.with(|core| core.borrow_mut().set_state_flags_range(start, count, flags))
}

#[wasm_bindgen]
pub fn set_color_index(index: u32, color_index: u32) -> bool {
    CORE.with(|core| core.borrow_mut().set_color_index(index, color_index))
}

#[wasm_bindgen]
pub fn dirty_range_buffer_ptr() -> u32 {
    CORE.with(|core| core.borrow().dirty_ranges.as_words().as_ptr() as usize as u32)
}

#[wasm_bindgen]
pub fn dirty_range_buffer_len() -> u32 {
    CORE.with(|core| core.borrow().dirty_ranges.as_words().len() as u32)
}

#[wasm_bindgen]
pub fn dirty_range_count() -> u32 {
    CORE.with(|core| core.borrow().dirty_ranges.range_count())
}

#[wasm_bindgen]
pub fn clear_dirty_ranges() {
    CORE.with(|core| core.borrow_mut().dirty_ranges.clear());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::instance::STATE_FLAG_SELECTED;

    #[test]
    fn dirty_ranges_coalesce_adjacent_and_overlapping_ranges() {
        let mut ranges = DirtyRanges::default();
        ranges.reserve_for_count(16);
        ranges.mark(10, 2);
        ranges.mark(13, 1);
        assert_eq!(ranges.as_words(), &[10, 2, 13, 1]);
        ranges.mark(12, 1);
        assert_eq!(ranges.as_words(), &[10, 4]);
        ranges.mark(4, 2);
        assert_eq!(ranges.as_words(), &[4, 2, 10, 4]);
        ranges.mark(5, 8);
        assert_eq!(ranges.as_words(), &[4, 10]);
    }

    #[test]
    fn state_updates_mark_dirty_ranges() {
        let mut core = LayoutCore::default();
        core.load_instances_for_test(vec![
            SeatInstance::default(),
            SeatInstance::default(),
            SeatInstance::default(),
            SeatInstance::default(),
        ]);
        core.dirty_ranges.clear();
        assert!(core.set_state_flags(1, STATE_FLAG_SELECTED));
        assert!(core.set_state_flags(2, STATE_FLAG_SELECTED));
        assert_eq!(core.dirty_ranges.as_words(), &[1, 2]);
    }
}
