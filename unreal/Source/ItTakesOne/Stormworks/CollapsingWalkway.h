#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "CollapsingWalkway.generated.h"

class UBoxComponent;
class UPointLightComponent;
class UStaticMeshComponent;

/**
 * One length of the old catwalk: a deck between two rails, hinged at its back end. It shudders and
 * its warning lamp flickers before it goes (telegraph), then it tips and drops into the sea. It
 * stops being solid a moment after it starts to fall, so anyone still on it falls with it.
 */
UCLASS()
class ITTAKESONE_API ACollapsingSegment : public AActor
{
	GENERATED_BODY()

public:
	ACollapsingSegment();

	UPROPERTY(VisibleAnywhere, Category = "Walkway")
	TObjectPtr<USceneComponent> Root;

	/** Everything that moves hangs from this hinge at the segment's back end. */
	UPROPERTY(VisibleAnywhere, Category = "Walkway")
	TObjectPtr<USceneComponent> Hinge;

	UPROPERTY(VisibleAnywhere, Category = "Walkway")
	TObjectPtr<UStaticMeshComponent> Deck;

	UPROPERTY(VisibleAnywhere, Category = "Walkway")
	TObjectPtr<UStaticMeshComponent> RailLeft;

	UPROPERTY(VisibleAnywhere, Category = "Walkway")
	TObjectPtr<UStaticMeshComponent> RailRight;

	UPROPERTY(VisibleAnywhere, Category = "Walkway")
	TObjectPtr<UPointLightComponent> Warning;

	/** Length (X, forward), width (Y), deck thickness (Z), cm. The actor sits at the deck's back end, top surface. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Walkway")
	FVector Size = FVector(600.f, 220.f, 25.f);

	bool IsStanding() const { return Phase == 0; }
	bool HasFallen() const { return Phase >= 2; }

	void Telegraph();
	void Fall();
	void Restore();

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	void SetSolid(bool bSolid);

	/** 0 standing, 1 shuddering, 2 falling, 3 gone. */
	int32 Phase = 0;
	float T = 0.f;
	float Spin = 1.f;
};

/**
 * The old catwalk out to the lighthouse tower. Armed by the storm director when the storm engine
 * comes on; once armed, stepping onto it starts the collapse: after `StartDelay`, one segment
 * after another, each `Interval` apart and each shuddering `TelegraphTime` before it goes. A fall
 * back to the checkpoint resets it, and it starts again when she steps back on.
 */
UCLASS()
class ITTAKESONE_API ACollapsingWalkway : public AActor
{
	GENERATED_BODY()

public:
	ACollapsingWalkway();

	UPROPERTY(VisibleAnywhere, Category = "Walkway")
	TObjectPtr<UBoxComponent> StartTrigger;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Walkway")
	TArray<TObjectPtr<ACollapsingSegment>> Segments;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Walkway")
	float StartDelay = 1.6f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Walkway")
	float Interval = 1.8f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Walkway")
	float TelegraphTime = 0.8f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Walkway")
	FVector TriggerExtent = FVector(150.f, 150.f, 150.f);

	bool bArmed = false;
	bool bRunning = false;
	int32 Runs = 0;
	int32 Fallen = 0;

	void Arm() { bArmed = true; }
	void StartCollapse();
	void ResetWalkway();

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	UFUNCTION()
	void OnEnter(UPrimitiveComponent* Overlapped, AActor* Other, UPrimitiveComponent* OtherComp, int32 BodyIndex, bool bFromSweep, const FHitResult& Sweep);

	float T = 0.f;
	TArray<int32> Stage;
};
