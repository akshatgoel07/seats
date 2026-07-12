use crate::instance::SeatInstance;

const TARGET_SEATS_PER_CELL: f32 = 16.0;
const MIN_CELL_SIZE: f32 = 0.001;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Rect {
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
}

impl Rect {
    pub fn new(min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> Self {
        Self {
            min_x: min_x.min(max_x),
            min_y: min_y.min(max_y),
            max_x: min_x.max(max_x),
            max_y: min_y.max(max_y),
        }
    }

    pub fn for_seat(instance: SeatInstance) -> Self {
        let half = instance.half_size();
        Self::new(
            instance.x - half,
            instance.y - half,
            instance.x + half,
            instance.y + half,
        )
    }

    #[inline]
    pub fn is_finite(self) -> bool {
        self.min_x.is_finite()
            && self.min_y.is_finite()
            && self.max_x.is_finite()
            && self.max_y.is_finite()
    }

    #[inline]
    pub fn intersects(self, other: Self) -> bool {
        self.min_x <= other.max_x
            && self.max_x >= other.min_x
            && self.min_y <= other.max_y
            && self.max_y >= other.min_y
    }

    #[inline]
    pub fn intersects_seat_aabb(self, instance: SeatInstance) -> bool {
        self.intersects(Self::for_seat(instance))
    }
}

#[derive(Clone, Debug)]
pub struct SpatialIndex {
    bounds: Rect,
    cell_size: f32,
    cols: u32,
    rows: u32,
    cells: Vec<Vec<u32>>,
    max_half_size: f32,
}

impl Default for SpatialIndex {
    fn default() -> Self {
        Self {
            bounds: Rect::default(),
            cell_size: 1.0,
            cols: 0,
            rows: 0,
            cells: Vec::new(),
            max_half_size: 0.0,
        }
    }
}

impl SpatialIndex {
    pub fn build(instances: &[SeatInstance]) -> Self {
        if instances.is_empty() {
            return Self::default();
        }

        let mut bounds = Rect {
            min_x: f32::INFINITY,
            min_y: f32::INFINITY,
            max_x: f32::NEG_INFINITY,
            max_y: f32::NEG_INFINITY,
        };
        let mut max_half_size = 0.0f32;

        for &instance in instances {
            let rect = Rect::for_seat(instance);
            bounds.min_x = bounds.min_x.min(rect.min_x);
            bounds.min_y = bounds.min_y.min(rect.min_y);
            bounds.max_x = bounds.max_x.max(rect.max_x);
            bounds.max_y = bounds.max_y.max(rect.max_y);
            max_half_size = max_half_size.max(instance.half_size());
        }

        let width = (bounds.max_x - bounds.min_x).max(MIN_CELL_SIZE);
        let height = (bounds.max_y - bounds.min_y).max(MIN_CELL_SIZE);
        let area = width * height;
        let density_cell_size = ((area / instances.len() as f32) * TARGET_SEATS_PER_CELL).sqrt();
        let cell_size = density_cell_size
            .max(max_half_size * 2.0)
            .max(MIN_CELL_SIZE);
        let cols = ((width / cell_size).ceil() as u32).max(1);
        let rows = ((height / cell_size).ceil() as u32).max(1);

        let mut index = Self {
            bounds,
            cell_size,
            cols,
            rows,
            cells: vec![Vec::new(); (cols as usize) * (rows as usize)],
            max_half_size,
        };

        for (seat_index, &instance) in instances.iter().enumerate() {
            let rect = Rect::for_seat(instance);
            let Some((min_col, min_row, max_col, max_row)) = index.cell_span(rect) else {
                continue;
            };
            for row in min_row..=max_row {
                for col in min_col..=max_col {
                    let cell_index = index.cell_index(col, row);
                    index.cells[cell_index].push(seat_index as u32);
                }
            }
        }

        index
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.cols == 0 || self.rows == 0
    }

    #[inline]
    pub fn bounds(&self) -> Rect {
        self.bounds
    }

    #[inline]
    pub fn max_half_size(&self) -> f32 {
        self.max_half_size
    }

    pub fn for_each_candidate(&self, rect: Rect, mut f: impl FnMut(u32)) {
        let Some((min_col, min_row, max_col, max_row)) = self.cell_span(rect) else {
            return;
        };

        for row in min_row..=max_row {
            for col in min_col..=max_col {
                for &seat_index in &self.cells[self.cell_index(col, row)] {
                    f(seat_index);
                }
            }
        }
    }

    fn cell_span(&self, rect: Rect) -> Option<(u32, u32, u32, u32)> {
        if self.is_empty() || !rect.is_finite() || !rect.intersects(self.bounds) {
            return None;
        }

        Some((
            self.coord_to_col(rect.min_x),
            self.coord_to_row(rect.min_y),
            self.coord_to_col(rect.max_x),
            self.coord_to_row(rect.max_y),
        ))
    }

    #[inline]
    fn cell_index(&self, col: u32, row: u32) -> usize {
        (row as usize) * (self.cols as usize) + (col as usize)
    }

    #[inline]
    fn coord_to_col(&self, x: f32) -> u32 {
        self.coord_to_axis(x, self.bounds.min_x, self.cols)
    }

    #[inline]
    fn coord_to_row(&self, y: f32) -> u32 {
        self.coord_to_axis(y, self.bounds.min_y, self.rows)
    }

    #[inline]
    fn coord_to_axis(&self, value: f32, min: f32, count: u32) -> u32 {
        let raw = ((value - min) / self.cell_size).floor() as i64;
        raw.clamp(0, i64::from(count - 1)) as u32
    }
}
