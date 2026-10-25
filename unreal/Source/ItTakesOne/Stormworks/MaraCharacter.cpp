#include "Stormworks/MaraCharacter.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Engine/LocalPlayer.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "Stormworks/MaraAnimInstance.h"
#include "Stormworks/MaraFootsteps.h"

AMaraCharacter::AMaraCharacter()
{
	// Her size (UMaraAnimInstance::Dress sets the same).
	GetCapsuleComponent()->InitCapsuleSize(30.f, 66.f);

	// The Third Person template's character, value for value.
	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = false;
	bUseControllerRotationRoll = false;
	UCharacterMovementComponent* MC = GetCharacterMovement();
	MC->bOrientRotationToMovement = true;
	MC->RotationRate = FRotator(0.f, 500.f, 0.f);
	MC->MaxWalkSpeed = 600.f;
	MC->MinAnalogWalkSpeed = 20.f;
	MC->MaxAcceleration = 1500.f;
	MC->BrakingDecelerationWalking = 2000.f;
	MC->BrakingDecelerationFalling = 1500.f;
	MC->GroundFriction = 8.f;
	MC->JumpZVelocity = 500.f;
	MC->AirControl = 0.35f;
	MC->GravityScale = 1.f;

	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(RootComponent);
	CameraBoom->SetRelativeLocation(FVector(0.f, 0.f, 8.5f));
	CameraBoom->TargetArmLength = 400.f;
	CameraBoom->bUsePawnControlRotation = true;
	CameraBoom->bDoCollisionTest = true;
	CameraBoom->ProbeSize = 12.f;

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;
	FollowCamera->SetFieldOfView(90.f);
}

void AMaraCharacter::BeginPlay()
{
	Super::BeginPlay();
	bDressed = UMaraAnimInstance::Dress(this);
	if (bDressed && !FindComponentByClass<UMaraFootsteps>())
	{
		UMaraFootsteps* Steps = NewObject<UMaraFootsteps>(this, TEXT("Footsteps"));
		Steps->RegisterComponent();
	}
}

void AMaraCharacter::BuildInput()
{
	if (Mapping)
	{
		return;
	}
	// Built at run time, like the template's IMC_Default and IMC_MouseLook (same keys, same modifiers).
	MoveAction = NewObject<UInputAction>(this, TEXT("IA_Move"));
	MoveAction->ValueType = EInputActionValueType::Axis2D;
	LookAction = NewObject<UInputAction>(this, TEXT("IA_Look"));
	LookAction->ValueType = EInputActionValueType::Axis2D;
	JumpAction = NewObject<UInputAction>(this, TEXT("IA_Jump"));
	JumpAction->ValueType = EInputActionValueType::Boolean;
	Mapping = NewObject<UInputMappingContext>(this, TEXT("IMC_Mara"));

	auto Swizzle = [this]()
	{
		UInputModifierSwizzleAxis* M = NewObject<UInputModifierSwizzleAxis>(Mapping);
		M->Order = EInputAxisSwizzle::YXZ;
		return M;
	};
	auto Negate = [this](bool bX, bool bY)
	{
		UInputModifierNegate* M = NewObject<UInputModifierNegate>(Mapping);
		M->bX = bX;
		M->bY = bY;
		M->bZ = bX;
		return M;
	};
	auto DeadZone = [this]()
	{
		UInputModifierDeadZone* M = NewObject<UInputModifierDeadZone>(Mapping);
		M->LowerThreshold = 0.2f;
		return M;
	};
	// Forward and back are the Y axis, left and right the X axis.
	for (const FKey& Key : {EKeys::W, EKeys::Up})
	{
		Mapping->MapKey(MoveAction, Key).Modifiers.Add(Swizzle());
	}
	for (const FKey& Key : {EKeys::S, EKeys::Down})
	{
		FEnhancedActionKeyMapping& M = Mapping->MapKey(MoveAction, Key);
		M.Modifiers.Add(Swizzle());
		M.Modifiers.Add(Negate(true, true));
	}
	for (const FKey& Key : {EKeys::A, EKeys::Left})
	{
		Mapping->MapKey(MoveAction, Key).Modifiers.Add(Negate(true, true));
	}
	Mapping->MapKey(MoveAction, EKeys::D);
	Mapping->MapKey(MoveAction, EKeys::Right);
	Mapping->MapKey(MoveAction, EKeys::Gamepad_Left2D).Modifiers.Add(DeadZone());
	Mapping->MapKey(LookAction, EKeys::Mouse2D).Modifiers.Add(Negate(false, true));
	Mapping->MapKey(LookAction, EKeys::Gamepad_Right2D).Modifiers.Add(DeadZone());
	Mapping->MapKey(JumpAction, EKeys::SpaceBar);
	Mapping->MapKey(JumpAction, EKeys::Gamepad_FaceButton_Bottom);
}

void AMaraCharacter::PawnClientRestart()
{
	Super::PawnClientRestart();
	BuildInput();
	if (const APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (UEnhancedInputLocalPlayerSubsystem* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			Sub->AddMappingContext(Mapping, 0);
		}
	}
}

void AMaraCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	BuildInput();
	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent))
	{
		EIC->BindAction(JumpAction, ETriggerEvent::Started, this, &ACharacter::Jump);
		EIC->BindAction(JumpAction, ETriggerEvent::Completed, this, &ACharacter::StopJumping);
		EIC->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AMaraCharacter::Move);
		EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &AMaraCharacter::Look);
	}
}

void AMaraCharacter::Move(const FInputActionValue& Value)
{
	const FVector2D V = Value.Get<FVector2D>();
	if (!Controller)
	{
		return;
	}
	const FRotator Yaw(0.f, Controller->GetControlRotation().Yaw, 0.f);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), V.Y);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), V.X);
}

void AMaraCharacter::Look(const FInputActionValue& Value)
{
	const FVector2D V = Value.Get<FVector2D>();
	AddControllerYawInput(V.X);
	AddControllerPitchInput(V.Y);
}
