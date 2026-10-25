#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "HouseHUD.generated.h"

/** The house's screen: objective, Mara's words, the prompt, the letterbox during the grab, the end card. */
UCLASS()
class ITTAKESONE_API AHouseHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

private:
	void Label(const FString& Text, float X, float Y, const FLinearColor& Color, float Scale, bool bCentred, bool bBackdrop);
};
