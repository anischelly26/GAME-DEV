#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "InputActionValue.h"
#include "MaraCharacter.generated.h"

class UCameraComponent;
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
 * Space or A to jump. The tether's own controls live on UTetherComponent.
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

	/** Whether Mara's import was found and put on (else the capsule plays with no mesh). */
	bool IsDressed() const { return bDressed; }

	virtual void BeginPlay() override;
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

	void BuildInput();
	bool bDressed = false;
};
