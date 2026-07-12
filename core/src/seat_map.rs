use std::fmt;

use crate::instance::{sanitize_state_flags, SeatInstance, SEAT_INSTANCE_STRIDE_BYTES};

#[derive(Debug, Clone, PartialEq)]
pub enum LoadError {
    CountTooLarge,
    LengthMismatch { expected: usize, actual: usize },
    InvalidInstance { index: usize, reason: &'static str },
}

impl fmt::Display for LoadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LoadError::CountTooLarge => write!(f, "instance count is too large"),
            LoadError::LengthMismatch { expected, actual } => {
                write!(
                    f,
                    "instance byte length mismatch: expected {expected}, got {actual}"
                )
            }
            LoadError::InvalidInstance { index, reason } => {
                write!(f, "invalid instance at index {index}: {reason}")
            }
        }
    }
}

impl std::error::Error for LoadError {}

pub fn load_instances_from_bytes(data: &[u8], count: u32) -> Result<Vec<SeatInstance>, LoadError> {
    let count = usize::try_from(count).map_err(|_| LoadError::CountTooLarge)?;
    let expected = count
        .checked_mul(SEAT_INSTANCE_STRIDE_BYTES)
        .ok_or(LoadError::CountTooLarge)?;
    if data.len() != expected {
        return Err(LoadError::LengthMismatch {
            expected,
            actual: data.len(),
        });
    }

    let mut instances = Vec::with_capacity(count);
    for (index, chunk) in data.chunks_exact(SEAT_INSTANCE_STRIDE_BYTES).enumerate() {
        let instance = SeatInstance {
            x: read_f32(chunk, 0),
            y: read_f32(chunk, 4),
            size: read_f32(chunk, 8),
            rotation: read_f32(chunk, 12),
            color_index: read_u32(chunk, 16),
            state_flags: sanitize_state_flags(read_u32(chunk, 20)),
        };
        validate_instance(index, instance)?;
        instances.push(instance);
    }

    Ok(instances)
}

fn validate_instance(index: usize, instance: SeatInstance) -> Result<(), LoadError> {
    if !instance.x.is_finite() || !instance.y.is_finite() {
        return Err(LoadError::InvalidInstance {
            index,
            reason: "position must be finite",
        });
    }
    if !instance.size.is_finite() || instance.size <= 0.0 {
        return Err(LoadError::InvalidInstance {
            index,
            reason: "size must be finite and positive",
        });
    }
    if !instance.rotation.is_finite() {
        return Err(LoadError::InvalidInstance {
            index,
            reason: "rotation must be finite",
        });
    }
    Ok(())
}

#[inline]
fn read_f32(bytes: &[u8], offset: usize) -> f32 {
    f32::from_le_bytes(
        bytes[offset..offset + 4]
            .try_into()
            .expect("validated chunk size"),
    )
}

#[inline]
fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(
        bytes[offset..offset + 4]
            .try_into()
            .expect("validated chunk size"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_instances_reads_interleaved_layout() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&1.0f32.to_le_bytes());
        bytes.extend_from_slice(&2.0f32.to_le_bytes());
        bytes.extend_from_slice(&0.7f32.to_le_bytes());
        bytes.extend_from_slice(&0.25f32.to_le_bytes());
        bytes.extend_from_slice(&4u32.to_le_bytes());
        bytes.extend_from_slice(&0xffff_ffffu32.to_le_bytes());

        let instances = load_instances_from_bytes(&bytes, 1).expect("valid instance bytes");
        assert_eq!(instances.len(), 1);
        assert_eq!(instances[0].x, 1.0);
        assert_eq!(instances[0].color_index, 4);
        assert_eq!(
            instances[0].state_flags & crate::instance::STATE_RESERVED_MASK,
            0
        );
    }
}
