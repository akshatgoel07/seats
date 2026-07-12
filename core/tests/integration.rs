use std::mem::{align_of, size_of};

use seat_layout_core::{
    culling::{query_viewport, CullingScratch},
    hit_test::{hit_test, HitTestScratch},
    instance::{SeatInstance, SEAT_INSTANCE_STRIDE_BYTES},
    spatial_index::{Rect, SpatialIndex},
    DirtyRanges,
};

#[derive(Clone)]
struct Lcg(u64);

impl Lcg {
    fn new(seed: u64) -> Self {
        Self(seed)
    }

    fn next_u32(&mut self) -> u32 {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (self.0 >> 32) as u32
    }

    fn next_f32(&mut self, min: f32, max: f32) -> f32 {
        let t = self.next_u32() as f32 / u32::MAX as f32;
        min + (max - min) * t
    }
}

fn random_instances(count: usize, seed: u64) -> Vec<SeatInstance> {
    let mut rng = Lcg::new(seed);
    (0..count)
        .map(|i| SeatInstance {
            x: rng.next_f32(-500.0, 500.0),
            y: rng.next_f32(-250.0, 250.0),
            size: rng.next_f32(0.3, 4.0),
            rotation: rng.next_f32(-std::f32::consts::PI, std::f32::consts::PI),
            color_index: (i % 8) as u32,
            state_flags: 0,
        })
        .collect()
}

fn brute_force_visible(instances: &[SeatInstance], rect: Rect) -> Vec<bool> {
    instances
        .iter()
        .map(|&instance| rect.intersects_seat_aabb(instance))
        .collect()
}

fn ranges_to_visible(count: usize, ranges: &[u32]) -> Vec<bool> {
    let mut visible = vec![false; count];
    for pair in ranges.chunks_exact(2) {
        let start = pair[0] as usize;
        let count = pair[1] as usize;
        for v in visible.iter_mut().skip(start).take(count) {
            *v = true;
        }
    }
    visible
}

#[test]
fn seat_instance_layout_is_24_bytes_and_4_byte_aligned() {
    assert_eq!(size_of::<SeatInstance>(), SEAT_INSTANCE_STRIDE_BYTES);
    assert_eq!(align_of::<SeatInstance>(), 4);
}

#[test]
fn grid_index_candidates_cover_brute_force_results() {
    let instances = random_instances(2_000, 17);
    let index = SpatialIndex::build(&instances);
    let mut rng = Lcg::new(99);

    for _ in 0..100 {
        let x = rng.next_f32(-600.0, 600.0);
        let y = rng.next_f32(-300.0, 300.0);
        let w = rng.next_f32(1.0, 90.0);
        let h = rng.next_f32(1.0, 60.0);
        let rect = Rect::new(x, y, x + w, y + h);
        let mut candidates = vec![false; instances.len()];
        index.for_each_candidate(rect, |seat_index| {
            candidates[seat_index as usize] = true;
        });

        for (i, &instance) in instances.iter().enumerate() {
            if rect.intersects_seat_aabb(instance) {
                assert!(candidates[i], "grid missed visible candidate at index {i}");
            }
        }
    }
}

#[test]
fn viewport_query_matches_brute_force_without_missed_seats() {
    let instances = random_instances(3_000, 42);
    let index = SpatialIndex::build(&instances);
    let mut scratch = CullingScratch::default();
    scratch.reserve_for_count(instances.len());
    let mut rng = Lcg::new(1234);

    for _ in 0..80 {
        let x = rng.next_f32(-520.0, 520.0);
        let y = rng.next_f32(-270.0, 270.0);
        let rect = Rect::new(
            x,
            y,
            x + rng.next_f32(3.0, 120.0),
            y + rng.next_f32(3.0, 80.0),
        );
        query_viewport(&instances, &index, &mut scratch, rect);
        assert_eq!(
            ranges_to_visible(instances.len(), scratch.ranges()),
            brute_force_visible(&instances, rect)
        );
    }
}

#[test]
fn hit_test_handles_rotated_overlapping_and_boundary_cases() {
    let instances = vec![
        SeatInstance {
            x: 0.0,
            y: 0.0,
            size: 2.0,
            rotation: 0.0,
            color_index: 0,
            state_flags: 0,
        },
        SeatInstance {
            x: 0.0,
            y: 0.0,
            size: 2.0,
            rotation: std::f32::consts::FRAC_PI_4,
            color_index: 0,
            state_flags: 0,
        },
        SeatInstance {
            x: 5.0,
            y: 0.0,
            size: 2.0,
            rotation: std::f32::consts::FRAC_PI_2,
            color_index: 0,
            state_flags: 0,
        },
    ];
    let index = SpatialIndex::build(&instances);
    let mut scratch = HitTestScratch::default();
    scratch.reserve_for_count(instances.len());

    assert_eq!(hit_test(&instances, &index, &mut scratch, 0.0, 0.0, 0.0), 1);
    assert_eq!(hit_test(&instances, &index, &mut scratch, 3.5, 0.0, 0.5), 2);
    assert_eq!(
        hit_test(&instances, &index, &mut scratch, 7.0, 0.0, 0.0),
        -1
    );
}

#[test]
fn dirty_range_coalescing_keeps_sorted_adjacent_pairs() {
    let mut ranges = DirtyRanges::default();
    ranges.reserve_for_count(100);
    ranges.mark(20, 2);
    ranges.mark(10, 3);
    ranges.mark(13, 7);
    ranges.mark(22, 1);
    assert_eq!(ranges.as_words(), &[10, 13]);
}
