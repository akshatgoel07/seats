use crate::{
    instance::SeatInstance,
    spatial_index::{Rect, SpatialIndex},
};

const HIT_EPSILON: f32 = 0.000_001;

#[derive(Debug, Default, Clone)]
pub struct HitTestScratch {
    seen_marks: Vec<u32>,
    epoch: u32,
}

impl HitTestScratch {
    pub fn reserve_for_count(&mut self, count: usize) {
        self.seen_marks.resize(count, 0);
        self.epoch = 0;
    }

    fn next_epoch(&mut self) -> u32 {
        if self.epoch == u32::MAX {
            self.seen_marks.fill(0);
            self.epoch = 1;
        } else {
            self.epoch += 1;
        }
        self.epoch
    }
}

#[derive(Clone, Copy, Debug)]
struct BestHit {
    index: u32,
    edge_distance: f32,
    inside_glyph: bool,
}

pub fn hit_test(
    instances: &[SeatInstance],
    index: &SpatialIndex,
    scratch: &mut HitTestScratch,
    x: f32,
    y: f32,
    radius: f32,
) -> i32 {
    if instances.is_empty() || index.is_empty() || !x.is_finite() || !y.is_finite() {
        return -1;
    }

    let radius = radius.max(0.0);
    if !radius.is_finite() {
        return -1;
    }

    let search = Rect::new(x - radius, y - radius, x + radius, y + radius);
    let epoch = scratch.next_epoch();
    let mut best: Option<BestHit> = None;

    {
        let seen_marks = &mut scratch.seen_marks;
        index.for_each_candidate(search, |seat_index| {
            let i = seat_index as usize;
            if i >= instances.len() || seen_marks[i] == epoch {
                return;
            }
            seen_marks[i] = epoch;

            let instance = instances[i];
            let dx = x - instance.x;
            let dy = y - instance.y;
            let edge_distance = (dx.mul_add(dx, dy * dy)).sqrt() - instance.half_size();
            if edge_distance > radius + HIT_EPSILON {
                return;
            }

            let candidate = BestHit {
                index: seat_index,
                edge_distance,
                inside_glyph: edge_distance <= HIT_EPSILON,
            };
            if best.map_or(true, |current| is_better_hit(candidate, current)) {
                best = Some(candidate);
            }
        });
    }

    best.map_or(-1, |hit| hit.index as i32)
}

fn is_better_hit(candidate: BestHit, current: BestHit) -> bool {
    match (candidate.inside_glyph, current.inside_glyph) {
        (true, false) => true,
        (false, true) => false,
        (true, true) => candidate.index > current.index,
        (false, false) => {
            candidate.edge_distance < current.edge_distance - HIT_EPSILON
                || ((candidate.edge_distance - current.edge_distance).abs() <= HIT_EPSILON
                    && candidate.index > current.index)
        }
    }
}
