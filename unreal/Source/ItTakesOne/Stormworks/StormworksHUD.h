#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "StormworksHUD.generated.h"

/**
 * Drawn with the canvas (no widget assets): the objective in the corner, a small reticle, a ring
 * round the tether's target with what the button will do ("Tether" or "Pull"; grey "Too far" when
 * the ring is out of reach), short messages, the open note, the fade after a respawn, and the
 * end card.
 */
UCLASS()
class ITTAKESONE_API AStormworksHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

private:
	void DrawRing(const FVector2D& Center, float Radius, const FLinearColor& Color, float Thickness);
	void DrawLabel(const FString& Text, float X, float Y, const FLinearColor& Color, float Scale, bool bCentered, bool bBackdrop);
	void DrawWrapped(const FString& Text, float X, float Y, float Width, const FLinearColor& Color, float Scale);
};
