/** All movement feel parameters in one place so they can be tuned (and reviewed) without hunting. */
export const MOVEMENT = {
  maxSpeed: 5.5,
  carrySpeedFactor: 0.85,
  /** Acceleration from a standstill up to `launchFraction` of top speed: a lively first step. */
  launchAccel: 52,
  launchFraction: 0.45,
  /** Acceleration above that, up to top speed: smooth rather than snappy. */
  groundAccel: 30,
  /** Braking with no input: about 0.12 s and 0.35 m from full speed, no skating. */
  groundDecel: 44,
  /** Acceleration when the stick points more than 60 degrees away from the current velocity. */
  turnAccel: 62,
  airAccel: 18,
  gravity: 26,
  fallGravityMul: 1.35,
  /** Extra gravity while rising with the jump button released (variable jump height). */
  jumpCutGravityMul: 2.6,
  jumpHeight: 1.45,
  maxFallSpeed: 26,
  coyoteTime: 0.15,
  jumpBuffer: 0.16,
  turnRate: 11,
  capsuleRadius: 0.3,
  capsuleHalfHeight: 0.45,
  /** Max height (above the feet) of a ledge the player is boosted onto when a jump falls just short. */
  ledgeAssist: 0.42,
};

export const PLAYER_CENTER_OFFSET = MOVEMENT.capsuleHalfHeight + MOVEMENT.capsuleRadius;
