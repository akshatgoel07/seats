use std::mem::{align_of, size_of};

pub const SEAT_INSTANCE_STRIDE_BYTES: usize = 24;
pub const SEAT_INSTANCE_WORDS: usize = 6;

pub const STATE_FLAG_SELECTED: u32 = 1 << 0;
pub const STATE_FLAG_HOVERED: u32 = 1 << 1;
pub const STATE_FLAG_UNAVAILABLE: u32 = 1 << 2;
pub const STATE_FLAG_DISABLED: u32 = 1 << 3;
pub const STATE_FLAG_HIGHLIGHTED: u32 = 1 << 4;
pub const STATE_FLAG_FOCUSED: u32 = 1 << 5;
pub const STATE_STATUS_CODE_SHIFT: u32 = 8;
pub const STATE_STATUS_CODE_MASK: u32 = 0xff << STATE_STATUS_CODE_SHIFT;
pub const STATE_RESERVED_MASK: u32 = 0xffff_0000u32 | (0x3u32 << 6);
pub const STATE_ALLOWED_MASK: u32 = !STATE_RESERVED_MASK;

#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SeatInstance {
    pub x: f32,
    pub y: f32,
    pub size: f32,
    pub rotation: f32,
    pub color_index: u32,
    pub state_flags: u32,
}

const _: () = assert!(size_of::<SeatInstance>() == SEAT_INSTANCE_STRIDE_BYTES);
const _: () = assert!(align_of::<SeatInstance>() == 4);

impl SeatInstance {
    #[inline]
    pub fn half_size(self) -> f32 {
        self.size * 0.5
    }
}

#[inline]
pub fn sanitize_state_flags(flags: u32) -> u32 {
    flags & STATE_ALLOWED_MASK
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seat_instance_layout_is_24_bytes_and_4_byte_aligned() {
        assert_eq!(size_of::<SeatInstance>(), 24);
        assert_eq!(align_of::<SeatInstance>(), 4);
        assert_eq!(SEAT_INSTANCE_WORDS, 6);
    }

    #[test]
    fn state_flag_reserved_bits_are_masked() {
        let flags =
            STATE_FLAG_SELECTED | STATE_FLAG_FOCUSED | STATE_STATUS_CODE_MASK | STATE_RESERVED_MASK;
        assert_eq!(sanitize_state_flags(flags) & STATE_RESERVED_MASK, 0);
        assert_ne!(sanitize_state_flags(flags) & STATE_FLAG_SELECTED, 0);
        assert_ne!(sanitize_state_flags(flags) & STATE_FLAG_FOCUSED, 0);
    }
}
