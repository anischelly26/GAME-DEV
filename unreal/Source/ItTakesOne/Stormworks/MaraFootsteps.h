#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "MaraFootsteps.generated.h"

class UMaraAnimInstance;

/**
 * Mara's footsteps and landings, from the animation's foot plants (never from a timer): one sound
 * per plant, chosen by the surface under her (stone, wood or metal, from the material's name), a
 * different recording from the last one, at her feet, louder with speed. Landings add a soft
 * impact, heavier after a long fall.
 *
 * Recordings: Kenney's Impact Sounds (CC0), imported by build_stormworks.py as SFX_Step_*.
 */
UCLASS(ClassGroup = (ItTakesOne))
class ITTAKESONE_API UMaraFootsteps : public UActorComponent
{
	GENERATED_BODY()

public:
	UMaraFootsteps();

	/** stone, wood or metal: what is under her now. */
	FName SurfaceUnder() const;

	// Read by the self-test.
	int32 Steps = 0;
	int32 Landings = 0;
	TMap<FName, int32> StepsBySurface;

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	void Bind();
	void OnFootDown(bool bLeft, float Speed);
	void OnLanded(float FallSpeed);

	TWeakObjectPtr<UMaraAnimInstance> Anim;
	TMap<FName, int32> LastVariant;
};
