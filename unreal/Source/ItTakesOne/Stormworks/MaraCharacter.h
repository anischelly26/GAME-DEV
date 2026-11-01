#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "InputActionValue.h"
#include "MaraCharacter.generated.h"

class UCameraComponent;
class UStaticMeshComponent;
class UInputAction;
class UInputMappingContext;
class USpringArmComponent;

/**
 * Mara as a character class of her own, so the project needs nothing from Epic's Third Person
 * template: the same movement, camera and controls as the template's character (values read from
 * BP_ThirdPersonCharacter and its input mapping contexts), with her meshes, animation, face and
 * footsteps put on in BeginPlay (UMaraAnimInstance::Dress).
 *
 * Controls: WASD or the arrow keys or the left stick to move, the mouse or the right stick to look,
 * Space or A to jump. In water she swims where the camera looks; Space or the right shoulder
 * rises, C, Ctrl or the left shoulder dives. The tether's own controls live on UTetherComponent.
 */
UCLASS()
class ITTAKESONE_API AMaraCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AMaraCharacter();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	TObjectPtr<USpringArmComponent> CameraBoom;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	TObjectPtr<UCameraComponent> FollowCamera;

	UPROPERTY(VisibleAnywhere, Category = "Mara")
	TObjectPtr<class UPointLightComponent> WaterLight;

	/** The air bubble Nacre puts over her head underwater. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Mara")
	TObjectPtr<UStaticMeshComponent> Bubble;

	void SetBubble(bool bOn) { bBubbleWanted = bOn; }
	bool HasBubble() const { return bBubbleWanted; }

	/** A soft light that keeps her readable in dark water (0 off, 1 full). */
	void SetWaterLight(float Amount);
	/** Held and moved by something else (Nacre's grab and tow): she poses as in the water. */
	void SetTowed(bool bOn) { bTowed = bOn; }
	/** Swimming or towed: the swim clips play, and her body points the way she is going. */
	bool IsInWater() const;

	/** The move stick or keys this frame (X right, Y forward), for things that steer her, like a tow. */
	FVector2D GetSteerInput() const;

	/** Whether Mara's import was found and put on (else the capsule plays with no mesh). */
	bool IsDressed() const { return bDressed; }

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void PawnClientRestart() override;

private:
	void Move(const FInputActionValue& Value);
	void Look(const FInputActionValue& Value);

	UPROPERTY(Transient)
	TObjectPtr<UInputMappingContext> Mapping;

	UPROPERTY(Transient)
	TObjectPtr<UInputAction> MoveAction;

	UPROPERTY(Transient)
	TObjectPtr<UInputAction> LookAction;

	UPROPERTY(Transient)
	TObjectPtr<UInputAction> JumpAction;

	UPROPERTY(Transient)
	TObjectPtr<UInputAction> DiveAction;

	FVector2D LastMove = FVector2D::ZeroVector;
	double LastMoveTime = -1.0;
	bool bDiving = false;
	/** Space held. ACharacter's bPressedJump lasts a single frame when there is no jump hold time. */
	bool bRising = false;
	bool bBubbleWanted = false;
	float BubbleScale = 0.f;
	bool bTowed = false;
	/** The boom's rise as walls push the camera in, and whether she is hidden from the lens. */
	float CameraLift = 0.f;
	bool bHiddenFromLens = false;
	/** How far her body is pitched along her travel (degrees, up is positive). */
	float BodyPitch = 0.f;

	void BuildInput();
	bool bDressed = false;
};
