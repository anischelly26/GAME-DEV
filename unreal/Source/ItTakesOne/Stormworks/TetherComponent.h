#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "TetherComponent.generated.h"

class ACharacter;
class APlayerController;
class ATetherPoint;
class UAudioComponent;
class UCableComponent;
class UCameraComponent;
class UInputAction;
class UInputMappingContext;

UENUM(BlueprintType)
enum class ETetherState : uint8
{
	Idle,
	/** The hook is flying to the ring. */
	Shooting,
	/** Latched to a machine that is running along its track. */
	Pulling,
	/** Carrying Mara along an arc to an anchor. */
	Reeling,
	/** The cable whips back to her hand. */
	Retracting,
};

/**
 * Ivo's maintenance tether, on Mara. Aim at a brass ring and press Tether (E, left mouse, right
 * trigger): the hook flies out on a visible cable and latches.
 *
 * - On a machine's ring, the tug runs the machine to the other end of its track.
 * - On an anchor ring, the cable carries her along a fixed arc and sets her down on the ring's
 *   landing spot. Jump lets go early, keeping her momentum.
 *
 * Targeting is forgiving: the best ring within a cone around the camera's view and within reach,
 * in line of sight. A ring in view but too far is reported (the HUD says so) instead of ignored.
 * The camera always stays with the player.
 */
UCLASS(ClassGroup = (ItTakesOne), meta = (BlueprintSpawnableComponent))
class ITTAKESONE_API UTetherComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UTetherComponent();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	float Range = 1200.f;

	/** Half-angle of the aiming cone around the camera's view (degrees). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	float AimConeDegrees = 26.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	float ShootTime = 0.14f;

	/** Speed along the arc to an anchor (cm/s); the arc takes 0.55 to 1.5 s. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Tether")
	float ReelSpeed = 1250.f;

	/** She has picked the tether up (Ivo's workbench). */
	UPROPERTY(VisibleInstanceOnly, BlueprintReadOnly, Category = "Tether")
	bool bHasTether = false;

	// Counters, for the HUD and the self-test.
	int32 Fires = 0;
	int32 Pulls = 0;
	int32 Reels = 0;
	int32 ReelArrivals = 0;
	int32 Refusals = 0;
	int32 TooFar = 0;

	ETetherState GetState() const { return State; }
	ATetherPoint* GetTarget() const { return Target.Get(); }
	ATetherPoint* GetOutOfReach() const { return FarTarget.Get(); }
	ATetherPoint* GetAttached() const { return Attached.Get(); }
	float GetStateTime() const { return StateT; }
	const UInputAction* GetRestartAction() const { return RestartAction; }
	const UInputMappingContext* GetMapping() const { return Mapping; }

	void GiveTether();

	/** The Tether button. True if the hook flew. */
	bool TryFire();

	/** Let go (Jump while carried keeps the momentum). */
	void Release(bool bKeepMomentum);

	/** Cancel everything at once (respawn). */
	void ResetTether();

	/** Camera trauma, 0..1 (adds up). */
	void AddShake(float Amount);

	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

private:
	ACharacter* GetCharacter() const;
	APlayerController* GetPC() const;
	FVector HandLocation() const;
	FVector ChestLocation() const;

	void SetupInput();
	void OnFirePressed();
	void OnReleasePressed();
	void OnRestartPressed();

	void UpdateTargeting();
	void SetState(ETetherState NewState);
	void Latch();
	void BeginReel(ATetherPoint* Point);
	void TickReel(float DeltaTime);
	void EndReel(bool bArrived, bool bKeepMomentum);
	void UpdateCable(float DeltaTime);
	void UpdateShake(float DeltaTime);
	void RestoreMovement();

	UPROPERTY(Transient)
	TObjectPtr<UCableComponent> Cable;

	/** The carry's travel sound: follows her, stops when the carry ends. */
	UPROPERTY(Transient)
	TObjectPtr<UAudioComponent> ReelAudio;

	UPROPERTY(Transient)
	TObjectPtr<UInputAction> FireAction;

	UPROPERTY(Transient)
	TObjectPtr<UInputAction> ReleaseAction;

	UPROPERTY(Transient)
	TObjectPtr<UInputAction> RestartAction;

	UPROPERTY(Transient)
	TObjectPtr<UInputMappingContext> Mapping;

	TWeakObjectPtr<ATetherPoint> Target;
	TWeakObjectPtr<ATetherPoint> FarTarget;
	TWeakObjectPtr<ATetherPoint> Attached;
	TWeakObjectPtr<UCameraComponent> Camera;

	ETetherState State = ETetherState::Idle;
	float StateT = 0.f;
	bool bInputBound = false;

	// Where the cable's end is (world) while it flies out or whips back.
	FVector CableEnd = FVector::ZeroVector;
	FVector RetractFrom = FVector::ZeroVector;

	// The carried arc.
	FVector ReelFrom = FVector::ZeroVector;
	FVector ReelControl = FVector::ZeroVector;
	FVector ReelTo = FVector::ZeroVector;
	/** The last refusal cue (they are rate-limited: spamming the button is not a drum). */
	double LastRefuseTime = -10.0;
	int32 LastLatchVariant = -1;
	void Refuse(const FVector& At, float Volume);
	void StopReelAudio(float FadeSeconds);
	/** Where the last frame sent her: how far she is from it is how far she has been held back. */
	FVector ReelLast = FVector::ZeroVector;
	float ReelDuration = 1.f;
	float Blocked = 0.f;

	// Movement settings borrowed while pulling or carried.
	bool bMovementBorrowed = false;
	float SavedAirControl = 0.35f;
	float SavedGravity = 1.f;
	float SavedWalkSpeed = 600.f;

	float Trauma = 0.f;
	FVector CameraBase = FVector::ZeroVector;
	bool bCameraBaseSet = false;
	float Time = 0.f;
};
