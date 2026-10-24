#pragma once

#include "CoreMinimal.h"

/** Small easing curves for the world's toys and props (never for anything Mara stands on). */
namespace StormEase
{
	/** 0..1 → 0..1, slow at both ends. */
	inline float InOut(float X)
	{
		X = FMath::Clamp(X, 0.f, 1.f);
		return X * X * (3.f - 2.f * X);
	}

	/** 0..1 → 0..1, fast start, gentle arrival. */
	inline float Out(float X)
	{
		X = FMath::Clamp(X, 0.f, 1.f);
		const float Y = 1.f - X;
		return 1.f - Y * Y * Y;
	}

	/** A settle after a push: Amplitude at T = 0, rocking at Frequency (Hz), dying away at Damping. */
	inline float Settle(float T, float Amplitude, float Frequency, float Damping)
	{
		return Amplitude * FMath::Exp(-Damping * T) * FMath::Cos(2.f * PI * Frequency * T);
	}
}
