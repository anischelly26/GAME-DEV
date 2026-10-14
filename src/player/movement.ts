/** All movement feel parameters in one place so they can be tuned (and reviewed) without hunting. */
export const MOVEMENT = {
  maxSpeed: 6.0,
  carrySpeedFactor: 0.85,
  groundAccel: 58,
  groundDecel: 46,
  /** Acceleration when the stick points against the current velocity (snappy reversals). */
  turnAccel: 95,
  airAccel: 24,
  gravity: 26,
  fallGravityMul: 1.35,
  /** Extra gravity while rising with the jump button released (variable jump height). */
  jumpCutGravityMul: 2.6,
  jumpHeight: 1.45,
  maxFallSpeed: 26,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  turnRate: 16,
  capsuleRadius: 0.3,
  capsuleHalfHeight: 0.45,
  /** Max height (above the feet) of a ledge the player is boosted onto when a jump falls just short. */
  ledgeAssist: 0.42,
};

export const PLAYER_CENTER_OFFSET = MOVEMENT.capsuleHalfHeight + MOVEMENT.capsuleRadius;
