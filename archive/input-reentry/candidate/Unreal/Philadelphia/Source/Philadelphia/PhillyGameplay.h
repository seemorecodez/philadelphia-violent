#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/SaveGame.h"
#include "GameFramework/HUD.h"
#include "PhillyGameplay.generated.h"

class UBoxComponent;
class USpringArmComponent;
class UCameraComponent;

UCLASS()
class APhillyVehicle : public APawn
{
    GENERATED_BODY()
public:
    APhillyVehicle();
    virtual void PossessedBy(AController* NewController) override;
    virtual void UnPossessed() override;
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;
    virtual void SetupPlayerInputComponent(UInputComponent* Input) override;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Body;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Visual;
    UPROPERTY(VisibleAnywhere) TObjectPtr<USpringArmComponent> Boom;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> Camera;
    UPROPERTY(EditAnywhere, Category="Vehicle") float MassKg = 1450;
    UPROPERTY(EditAnywhere, Category="Vehicle") float SpringRate = 36000;
    UPROPERTY(EditAnywhere, Category="Vehicle") float DamperRate = 4500;
    UPROPERTY(EditAnywhere, Category="Vehicle") float SuspensionRest = 45;
    UPROPERTY(EditAnywhere, Category="Vehicle") float WheelRadius = 34;
    float SpeedKmh() const;
    void ExitVehicle();
private:
    float Throttle = 0, Steering = 0;
    bool bHandbrake = false;
    bool bGroundReady = false;
    void ResetDriverInput();
    void SetThrottle(float V) { Throttle = V; }
    void SetSteering(float V) { Steering = V; }
    void BrakeOn() { bHandbrake = true; }
    void BrakeOff() { bHandbrake = false; }
    void Save();
    void Load();
};

UCLASS()
class APhillyCharacter : public ACharacter
{
    GENERATED_BODY()
public:
    APhillyCharacter();
    virtual void BeginPlay() override;
    virtual void SetupPlayerInputComponent(UInputComponent* Input) override;
    virtual void Tick(float DeltaTime) override;
    UPROPERTY(VisibleAnywhere) TObjectPtr<USpringArmComponent> Boom;
    UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> Camera;
    void EnterVehicle();
private:
    UPROPERTY() TObjectPtr<class UAnimSequence> IdleAnimation;
    UPROPERTY() TObjectPtr<class UAnimSequence> WalkAnimation;
    UPROPERTY() TObjectPtr<class UAnimSequence> RunAnimation;
    UPROPERTY() TObjectPtr<class UAnimSequence> CurrentAnimation;
    void Forward(float V);
    void Right(float V);
    void Turn(float V) { AddControllerYawInput(V); }
    void Look(float V) { AddControllerPitchInput(V); }
    void SprintOn();
    void SprintOff();
    void Save();
    void Load();
};

UCLASS()
class UPhillySave : public USaveGame
{
    GENERATED_BODY()
public:
    UPROPERTY() int32 Version = 1;
    UPROPERTY() FTransform Player;
    UPROPERTY() FTransform Vehicle;
    UPROPERTY() bool bDriving = false;
};

UCLASS()
class APhillyGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    APhillyGameMode();
    virtual void BeginPlay() override;
    virtual void Tick(float Dt) override;
    UPROPERTY() TObjectPtr<APhillyCharacter> Walker;
    UPROPERTY() TObjectPtr<APhillyVehicle> Vehicle;
    bool SaveProgress();
    bool LoadProgress();
    bool SetDriving(bool Driving);
    FString NeighborhoodDisplayName=TEXT("CHINATOWN");
private:
    double StartedAt=0;
    double LastFrameAt=0;
    bool bCaptureRequested=false;
    bool bEvaluation=false;
    bool bCityHallReview=false;
    bool bReadingTerminalReview=false;
    bool bArchStreetReview=false;
    bool bArchStreetPlayerReview=false;
    bool bWaitingForSpawnGround=false;
    FVector PendingSpawnPosition=FVector::ZeroVector;
    FRotator PendingSpawnRotation=FRotator::ZeroRotator;
    FVector StreetReviewPosition=FVector::ZeroVector;
    TArray<double> FrameTimes;
    TArray<double> GPUFrameTimes;
    int32 EvaluationWarmupFrames=0;
};

UCLASS()
class APhillyHUD : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;
};
