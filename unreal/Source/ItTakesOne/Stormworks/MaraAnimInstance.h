#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "MaraAnimInstance.generated.h"

class ACharacter;
class UAnimSequence;
class UTetherComponent;

/**
 * Mara's animation, driven from code: there is no Anim Blueprint graph. Her clips are the CC0
 * Quaternius Universal Animation Library clips the web game retargeted onto her skeleton (imported
 * with Mara.glb into /Game/ItTakesOne/Mara). The tuning is the web game's (PlayerAvatar.ts):
 *
 * - locomotion blends idle, walk, jog and sprint by ground speed, phase-locked (one shared phase)
 *   and time-scaled so the feet keep up with the capsule; a foot plants twice per cycle;
 * - in the air, the jump-start clip and then the jump loop; a short landing clip on touchdown;
 * - one-shot clips (the tether's throw, the pickup) are layered over the upper body only, from
 *   spine_01 up, so the legs keep walking;
 * - while the tether carries her, the jump loop.
 *
 * Animation never moves her: the capsule and the tether stay in charge of where she is.
 */
UCLASS(Transient, NotBlueprintable)
class ITTAKESONE_API UMaraAnimInstance : public UAnimInstance
{
	GENERATED_BODY()

public:
	/** Puts Mara on a Third Person character: her meshes, her capsule, this animation. */
	static bool Dress(ACharacter* Character);

	/** A one-shot clip over the upper body (or the whole body), from Start seconds in. */
	void PlayAction(FName Clip, float Rate = 1.f, float Start = 0.f, float Length = -1.f, bool bUpperBodyOnly = true);

	DECLARE_MULTICAST_DELEGATE_TwoParams(FOnFootDown, bool /*bLeft*/, float /*Speed*/);
	/** A foot plants (twice per locomotion cycle, while walking on the ground). */
	FOnFootDown OnFootDown;

	DECLARE_MULTICAST_DELEGATE_OneParam(FOnLanded, float /*FallSpeed*/);
	FOnLanded OnLanded;

	UPROPERTY(Transient)
	TMap<FName, TObjectPtr<UAnimSequence>> Clips;

	// What the proxy reads (copied on the game thread before each update).
	struct FLayer
	{
		const UAnimSequence* Seq = nullptr;
		float Time = 0.f;
		float Weight = 0.f;
	};
	TArray<FLayer> Layers;
	FLayer Overlay;
	bool bOverlayUpperOnly = true;

	// Read by the self-test.
	float GroundSpeed = 0.f;
	float Phase = 0.f;
	int32 FootDowns = 0;
	FName ActionName = NAME_None;

protected:
	virtual FAnimInstanceProxy* CreateAnimInstanceProxy() override;
	virtual void DestroyAnimInstanceProxy(FAnimInstanceProxy* InProxy) override;
	virtual void NativeInitializeAnimation() override;
	virtual void NativeUpdateAnimation(float DeltaSeconds) override;

private:
	const UAnimSequence* Clip(FName Name) const;
	float Length(FName Name) const;

	TWeakObjectPtr<ACharacter> Owner;
	TWeakObjectPtr<UTetherComponent> Tether;

	float AirBlend = 0.f;
	float AirTime = 0.f;
	float JumpStartT = -1.f;
	float LandT = -1.f;
	float LandWeight = 0.f;
	float CarryBlend = 0.f;
	bool bWasFalling = false;
	float LastFallSpeed = 0.f;
	float IdleTime = 0.f;
	float Clock = 0.f;
	float PullBlend = 0.f;

	FName Action = NAME_None;
	float ActionT = 0.f;
	float ActionStart = 0.f;
	float ActionLength = 0.f;
	float ActionRate = 1.f;
	float ActionWeight = 0.f;
	bool bActionUpper = true;
	int32 LastTetherFires = 0;
};
