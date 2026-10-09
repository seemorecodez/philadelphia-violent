#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "PhillyMechanicsProbe.generated.h"

// Explicit command-line diagnostic, using the real PlayerController input path.
UCLASS()
class APhillyMechanicsProbe : public AActor
{
    GENERATED_BODY()
public:
    APhillyMechanicsProbe();
    virtual void Tick(float Dt) override;
private:
    int32 Stage=0, WarmFrames=0;
    double StageAt=0, LastAt=0, LaunchAt=0;
    double WalkDistanceMeters=20;
    double WalkTurnMeters=0,WalkTurnYaw=0,CompletedWalkLeg=0;
    bool bWalkTurned=false;
    FVector WalkLegStart=FVector::ZeroVector;
    double BestWalkTravel=0, LastWalkProgressAt=0;
    FVector WalkStart=FVector::ZeroVector, DriveStart=FVector::ZeroVector;
    FTransform SavedWalker, SavedVehicle;
    FKey PulseKey;
    TArray<double> FrameTimes;
    double DrawCallSum=0,PrimitiveSum=0;
    int32 RenderSamples=0;
    FString Evidence;
    bool bDone=false;
    void Key(const FKey& K,bool Pressed);
    void Pulse(const FKey& K);
    void Next(int32 NewStage,const FString& Note);
    void Finish(bool Passed,const FString& Reason);
};
