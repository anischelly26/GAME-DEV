#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "NacreTentacle.generated.h"

class UAudioComponent;
class UInstancedStaticMeshComponent;
class UMaterialInstanceDynamic;

/** Nacre's colours, which the player learns to read (docs/STORY_HOUSE_AND_NACRE.md). */
UENUM(BlueprintType)
enum class ENacreTint : uint8
{
	/** Calm; "come" when the tip curls. */
	Pearl,
	/** Embarrassed or pleased. */
	Coral,
	/** "Hide: a lamp". It flattens too. */
	Deep,
};

/**
 * One of Nacre's tentacles: a chain of spheres along a curve from its base (a drain, a crack, the
 * body) to its tip, thick at the base and fine at the tip, swaying. One instanced mesh, so one draw
 * call. It grows out of its base and slides back in, carries things at its tip, freezes when told
 * to (the house's "it stops when you look at it"), curls its tip, and changes colour and shape for
 * its signals. All movement is eased; it never collides with anything.
 */
UCLASS()
class ITTAKESONE_API ANacreTentacle : public AActor
{
	GENERATED_BODY()

public:
	ANacreTentacle();

	UPROPERTY(VisibleAnywhere, Category = "Nacre")
	TObjectPtr<UInstancedStaticMeshComponent> Body;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Nacre")
	int32 Segments = 40;

	/** Radius at the base and at the tip (cm). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Nacre")
	float BaseRadius = 9.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Nacre")
	float TipRadius = 2.2f;

	/** How fast the tip travels (cm/s) and how far the tentacle can reach. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Nacre")
	float TipSpeed = 220.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Nacre")
	float Reach = 520.f;

	/** Out from the start, its tip at InitialTip (a tentacle that only sways, round Nacre's body). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Nacre")
	bool bStartOut = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Nacre")
	FVector InitialTip = FVector::ZeroVector;

	/** Drawn dark and unlit, a shape against the light (Nacre's arms in the reveal). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Nacre")
	bool bSilhouette = false;

	/** Out of its base (1) or back inside it (0). */
	void SetOut(bool bOut, float Seconds = 0.7f);
	/** Where the tip should go (world). It goes there at TipSpeed, eased, within reach. */
	void SetTipTarget(const FVector& Where) { TipTarget = Where; }
	/** Puts the tip there at once (and the target). */
	void SnapTip(const FVector& Where);
	/** Moves the base (only while it is in: it re-emerges somewhere else). */
	void MoveBase(const FVector& Where, const FRotator& Facing);
	void SetTint(ENacreTint NewTint) { Tint = NewTint; }
	/** Stops still, mid-gesture (no sway, no travel). */
	void SetFrozen(bool bFreeze) { bFrozen = bFreeze; }
	/** 0 straight, 1 the tip curled back on itself ("come"). */
	void SetCurl(float Amount) { CurlWant = Amount; }
	/** Carries an actor at its tip until released. */
	void Hold(AActor* Thing) { Held = Thing; }
	void Release() { Held = nullptr; }

	FVector GetTip() const { return Tip; }
	bool IsOut() const { return Extend > 0.95f; }
	bool IsIn() const { return Extend < 0.02f; }
	bool IsAtTarget(float Tolerance = 15.f) const;
	bool IsFrozen() const { return bFrozen; }
	ENacreTint GetTint() const { return Tint; }
	AActor* GetHeld() const { return Held.Get(); }
	/** How fast the tip moved over the last frame (cm/s), for the self-test. */
	float GetTipSpeed() const { return LastTipSpeed; }

	virtual void OnConstruction(const FTransform& Transform) override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

private:
	FVector CurvePoint(float U) const;
	void Draw();

	UPROPERTY(Transient)
	TObjectPtr<UMaterialInstanceDynamic> Skin;

	UPROPERTY(Transient)
	TObjectPtr<UAudioComponent> Slither;

	TWeakObjectPtr<AActor> Held;
	FVector Tip = FVector::ZeroVector;
	FVector TipTarget = FVector::ZeroVector;
	float Extend = 0.f;
	float ExtendWant = 0.f;
	float ExtendRate = 1.f;
	float Curl = 0.f;
	float CurlWant = 0.f;
	float Flat = 0.f;
	FLinearColor Colour = FLinearColor(0.82f, 0.8f, 0.84f);
	ENacreTint Tint = ENacreTint::Pearl;
	bool bFrozen = false;
	float SwayTime = 0.f;
	float LastTipSpeed = 0.f;
	float Seed = 0.f;
};
