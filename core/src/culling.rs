use crate::{
    instance::SeatInstance,
    spatial_index::{Rect, SpatialIndex},
};

#[derive(Debug, Default, Clone)]
pub struct CullingScratch {
    candidate_marks: Vec<u32>,
    visible_marks: Vec<u32>,
    epoch: u32,
    range_buffer: Vec<u32>,
}

impl CullingScratch {
    pub fn reserve_for_count(&mut self, count: usize) {
        self.candidate_marks.resize(count, 0);
        self.visible_marks.resize(count, 0);
        self.range_buffer.clear();
        let needed_words = count.saturating_mul(2);
        if self.range_buffer.capacity() < needed_words {
            self.range_buffer
                .reserve_exact(needed_words - self.range_buffer.capacity());
        }
        self.epoch = 0;
    }

    #[inline]
    pub fn ranges(&self) -> &[u32] {
        &self.range_buffer
    }

    #[inline]
    pub fn range_count(&self) -> u32 {
        (self.range_buffer.len() / 2) as u32
    }

    fn next_epoch(&mut self) -> u32 {
        if self.epoch == u32::MAX {
            self.candidate_marks.fill(0);
            self.visible_marks.fill(0);
            self.epoch = 1;
        } else {
            self.epoch += 1;
        }
        self.epoch
    }
}

pub fn query_viewport(
    instances: &[SeatInstance],
    index: &SpatialIndex,
    scratch: &mut CullingScratch,
    rect: Rect,
) -> u32 {
    scratch.range_buffer.clear();
    if instances.is_empty() || index.is_empty() || !rect.is_finite() {
        return 0;
    }

    let epoch = scratch.next_epoch();
    {
        let candidate_marks = &mut scratch.candidate_marks;
        let visible_marks = &mut scratch.visible_marks;
        index.for_each_candidate(rect, |seat_index| {
            let i = seat_index as usize;
            if i >= instances.len() || candidate_marks[i] == epoch {
                return;
            }
            candidate_marks[i] = epoch;
            if rect.intersects_seat_aabb(instances[i]) {
                visible_marks[i] = epoch;
            }
        });
    }

    let mut open_start: Option<u32> = None;
    for i in 0..instances.len() {
        if scratch.visible_marks[i] == epoch {
            if open_start.is_none() {
                open_start = Some(i as u32);
            }
        } else if let Some(start) = open_start.take() {
            scratch.range_buffer.push(start);
            scratch.range_buffer.push((i as u32) - start);
        }
    }
    if let Some(start) = open_start {
        scratch.range_buffer.push(start);
        scratch
            .range_buffer
            .push((instances.len() as u32).saturating_sub(start));
    }

    scratch.range_count()
}
