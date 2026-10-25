#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "WindChimes.generated.h"

class UStaticMeshComponent;

/**
 * Five brass chime tubes hung on the gallery wall by Ivo's chalk arrow, just before the broken
 * seawall: the "musical discovery". When Mara walks up to them they ring down the scale one after
 * another (D E F# A B) and swing: a small pull back (anticipation), the swing as the clapper strikes
 * (action), then a long, dying sway (settle). The storm rings one now and then too, quietly.
 * Each tube sounds at most once every quarter of a second, so they never pile up.
 */
UCLASS()
class ITTAKESONE_API AWindChimes : public AActor
{
	GENERATED_BODY()

public:
	AWindChimes();

	UPROPERTY(VisibleAnywhere, Category = "Chimes")
	TObjectPtr<USceneComponent> Root;

	UPROPERTY(VisibleAnywhere, Category = "Chimes")
	TObjectPtr<UStaticMeshComponent> Bracket;

	/** She sets them ringing when she comes this close (cm), and again after going this far away. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Chimes")
	float Near = 260.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Chimes")
	float Away = 500.f;

	void Ring(float Strength);

	int32 Rings = 0;
	int32 Notes = 0;

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void Tick(float DeltaSeconds) override;

private:
	UPROPERTY(VisibleAnywhere, Category = "Chimes")
	TArray<TObjectPtr<UStaticMeshComponent>> TubeMeshes;

	struct FTube
	{
		USceneComponent* Hinge = nullptr;
		float StartT = -1.f;
		float Strength = 1.f;
		bool bStruck = false;
		float LastNote = -10.f;
	};
	FTube Tubes[5];
	float Time = 0.f;
	float NextGust = 7.f;
	bool bArmed = true;
};
