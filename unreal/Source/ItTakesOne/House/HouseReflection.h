#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "HouseReflection.generated.h"

class UPointLightComponent;
class UStaticMeshComponent;
class UPoseableMeshComponent;

/**
 * Mara's reflection in the cottage's dark west windows (docs/STORY_HOUSE_AND_NACRE.md, step 4,
 * "something wrong"). A mirrored copy of her, posed from her own skeleton every frame, stands where a
 * reflection in the glass would be: outside, so the walls hide it except through the windows.
 * Normally it keeps up with her. When the water glass plays, it falls most of a second behind, so it
 * turns its head late, then catches up. Shown only while she is in the house.
 */
UCLASS()
class ITTAKESONE_API AHouseReflection : public AActor
{
	GENERATED_BODY()

public:
	AHouseReflection();

	/** The mirror: the plane y = MirrorY (world, cm), the glass of the west windows. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "House")
	float MirrorY = -412.f;

	void SetShown(bool bShow);
	/** Falls behind her by up to Seconds, stays behind for Hold seconds, then catches up. */
	void Lag(float Seconds, float Hold);
	/** How far behind her it is now (s). */
	float GetDelay() const { return Delay; }
	bool IsShown() const { return bShown && bBuilt; }

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	bool Build();
	void Copy(USceneComponent* From, USceneComponent* To);

	struct FFrame
	{
		double Time = 0.0;
		FTransform Root;
		TArray<FTransform> Bones;
	};

	UPROPERTY(Transient)
	TObjectPtr<UPoseableMeshComponent> Pose;

	UPROPERTY(Transient)
	TObjectPtr<UPointLightComponent> Glow;

	/** Dark behind her, so the window reads as night glass while she is in it. */
	UPROPERTY(VisibleAnywhere, Category = "House")
	TObjectPtr<UStaticMeshComponent> Night;

	/** Her last two seconds, oldest first. */
	TArray<FFrame> Frames;
	double Clock = 0.0;
	float Delay = 0.f;
	float DelayWant = 0.f;
	float HoldLeft = 0.f;
	bool bBuilt = false;
	bool bShown = false;
};
