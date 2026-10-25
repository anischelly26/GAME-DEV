#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "WorkshopToy.generated.h"

class UStaticMeshComponent;

/**
 * Ivo's wind-up tin boat on his workbench, a small thing to play with before the escape. E winds it
 * (the HUD offers it when she is close and facing it). It leans back while the key turns
 * (anticipation), lunges and rolls along the bench (action), then rocks to a stop (settle). The
 * next wind sends it back the other way, so it never runs off the bench. Pressing E while it runs
 * does nothing. Purely decorative: it has no collision.
 */
UCLASS()
class ITTAKESONE_API AWorkshopToy : public AActor
{
	GENERATED_BODY()

public:
	AWorkshopToy();

	UPROPERTY(VisibleAnywhere, Category = "Toy")
	TObjectPtr<USceneComponent> Root;

	/** Rocks about the rear axle. */
	UPROPERTY(VisibleAnywhere, Category = "Toy")
	TObjectPtr<USceneComponent> Pivot;

	UPROPERTY(VisibleAnywhere, Category = "Toy")
	TObjectPtr<UStaticMeshComponent> Hull;

	UPROPERTY(VisibleAnywhere, Category = "Toy")
	TObjectPtr<UStaticMeshComponent> Cabin;

	UPROPERTY(VisibleAnywhere, Category = "Toy")
	TObjectPtr<UStaticMeshComponent> Funnel;

	UPROPERTY(VisibleAnywhere, Category = "Toy")
	TObjectPtr<UStaticMeshComponent> Key;

	/** How far one run carries it along the bench (cm, along its forward axis). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Toy")
	float Travel = 28.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Toy")
	FString Prompt = TEXT("Wind up");

	/** Starts a run. False while one is still going. */
	bool Play();

	bool IsPlaying() const { return T >= 0.f; }
	float GetOffset() const { return Offset; }
	int32 Plays = 0;

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	float T = -1.f;
	float Dir = 1.f;
	float From = 0.f;
	float Offset = 0.f;
	int32 Clicks = 0;
	int32 LastTin = -1;
	bool bRolled = false;
};
