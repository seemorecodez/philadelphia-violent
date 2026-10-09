#include "PhillyGameplay.h"
#include "PhillyDistrict.h"
#include "PhillyMechanicsProbe.h"
#include "Animation/AnimSequence.h"
#include "Camera/CameraComponent.h"
#include "Camera/CameraActor.h"
#include "Components/BoxComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Materials/MaterialInterface.h"
#include "HighResScreenshot.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/PlatformMemory.h"
#include "HAL/FileManager.h"
#include "UnrealClient.h"
#include "DynamicRHI.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

APhillyVehicle::APhillyVehicle()
{
    PrimaryActorTick.bCanEverTick = true;
    AutoPossessAI=EAutoPossessAI::Disabled;
    Body = CreateDefaultSubobject<UBoxComponent>(TEXT("VehicleBody"));
    SetRootComponent(Body);
    Body->SetBoxExtent(FVector(213,96,38));
    Body->SetCollisionProfileName(TEXT("PhysicsActor"));
    Body->SetSimulatePhysics(false);
    Body->SetLinearDamping(.08f);
    Body->SetAngularDamping(1.0f);
    Body->BodyInstance.bUseCCD = true;
    Visual = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mustang"));
    Visual->SetupAttachment(Body);
    Visual->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Visual->bDisallowNanite=true;
    Visual->SetRelativeLocation(FVector(0,0,-62));
    Visual->SetRelativeRotation(FRotator(0,-90,0));
    Boom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
    Boom->SetupAttachment(Body);
    Boom->TargetArmLength = 670;
    Boom->SocketOffset = FVector(0,0,180);
    Boom->SetRelativeRotation(FRotator(-12,0,0));
    Boom->bEnableCameraLag = true;
    Boom->CameraLagSpeed = 8;
    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(Boom);
}

void APhillyVehicle::BeginPlay()
{
    Super::BeginPlay();
    Visual->SetRelativeRotation(FRotator(0,-90,0));
    Body->SetMassOverrideInKg(NAME_None,MassKg,true);
    Body->SetSimulatePhysics(false);
}

void APhillyVehicle::SetupPlayerInputComponent(UInputComponent* Input)
{
    Super::SetupPlayerInputComponent(Input);
    Input->BindAxis("MoveForward",this,&APhillyVehicle::SetThrottle);
    Input->BindAxis("MoveRight",this,&APhillyVehicle::SetSteering);
    Input->BindAction("EnterExit",IE_Pressed,this,&APhillyVehicle::ExitVehicle);
    Input->BindAction("Handbrake",IE_Pressed,this,&APhillyVehicle::BrakeOn);
    Input->BindAction("Handbrake",IE_Released,this,&APhillyVehicle::BrakeOff);
    Input->BindAction("Save",IE_Pressed,this,&APhillyVehicle::Save);
    Input->BindAction("Load",IE_Pressed,this,&APhillyVehicle::Load);
}

float APhillyVehicle::SpeedKmh() const { return Body->GetPhysicsLinearVelocity().Size() * .036f; }

void APhillyVehicle::Tick(float Dt)
{
    Super::Tick(Dt);
    if (Dt <= 0) return;
    if(!bGroundReady)
    {
        FHitResult Ground;
        FCollisionQueryParams Query(SCENE_QUERY_STAT(PhillyVehicleReady),false,this);
        const FVector P=GetActorLocation();
        if(!GetWorld()->LineTraceSingleByChannel(Ground,P+FVector(0,0,80),P-FVector(0,0,300),ECC_Visibility,Query))return;
        SetActorLocation(Ground.ImpactPoint+FVector(0,0,70),false,nullptr,ETeleportType::TeleportPhysics);
        Body->SetSimulatePhysics(true);
        bGroundReady=true;
    }
    // This is the player vehicle. A default placed-pawn AI controller is not
    // driver intent; traffic will require its own explicit driving integration.
    const bool bDriven = IsPlayerControlled();
    const FVector Up = GetActorUpVector();
    for (float X : {135.f,-135.f}) for (float Y : {-82.f,82.f})
    {
        const FVector Anchor = GetActorTransform().TransformPosition(FVector(X,Y,5));
        FHitResult Hit;
        FCollisionQueryParams Query(SCENE_QUERY_STAT(PhillySuspension),false,this);
        if (!GetWorld()->LineTraceSingleByChannel(Hit,Anchor,Anchor-Up*(SuspensionRest+WheelRadius),ECC_Visibility,Query)) continue;
        const float Compression = FMath::Clamp(SuspensionRest - (Hit.Distance-WheelRadius),0.f,45.f);
        const FVector Velocity = Body->GetPhysicsLinearVelocityAtPoint(Anchor);
        const float NormalForce = FMath::Clamp(Compression*SpringRate-FVector::DotProduct(Velocity,Up)*DamperRate,0.f,MassKg*980.f);
        Body->AddForceAtLocation(Up*NormalForce,Anchor);
        const float Angle = X>0 && bDriven ? Steering*30.f : 0.f;
        const FVector Forward = GetActorForwardVector().RotateAngleAxis(Angle,Up);
        const FVector Right = FVector::CrossProduct(Up,Forward);
        const float Grip = NormalForce * ((bHandbrake && X<0) ? .35f : 1.05f);
        // A finite response rate avoids trying to cancel all contact velocity
        // in one render tick, which overcorrects coupled chassis rotation.
        constexpr float TireResponsePerSecond=8.f;
        const float SideForce = FMath::Clamp(-FVector::DotProduct(Velocity,Right)*MassKg*.25f*TireResponsePerSecond,-Grip,Grip);
        const float LongSpeed = FVector::DotProduct(Velocity,Forward);
        const bool Braking = !bDriven || bHandbrake || (Throttle*LongSpeed < -40);
        const float DriveForce = Braking ? FMath::Clamp(-LongSpeed*MassKg*.25f*TireResponsePerSecond,-Grip,Grip)
            : FMath::Clamp(Throttle*MassKg*350.f*.25f-LongSpeed*18.f,-Grip,Grip);
        Body->AddForceAtLocation((Right*SideForce+Forward*DriveForce).GetClampedToMaxSize(Grip),Hit.ImpactPoint);
    }
}

void APhillyVehicle::ExitVehicle() { if(auto* G=Cast<APhillyGameMode>(GetWorld()->GetAuthGameMode())) G->SetDriving(false); }
void APhillyVehicle::Save() { if(auto* G=Cast<APhillyGameMode>(GetWorld()->GetAuthGameMode())) G->SaveProgress(); }
void APhillyVehicle::Load() { if(auto* G=Cast<APhillyGameMode>(GetWorld()->GetAuthGameMode())) G->LoadProgress(); }

APhillyCharacter::APhillyCharacter()
{
    PrimaryActorTick.bCanEverTick = true;
    GetCapsuleComponent()->InitCapsuleSize(34,90);
    GetCharacterMovement()->MaxWalkSpeed=180;
    GetCharacterMovement()->JumpZVelocity=420;
    GetCharacterMovement()->AirControl=.25f;
    GetCharacterMovement()->MaxStepHeight=25;
    GetCharacterMovement()->bOrientRotationToMovement=true;
    GetCharacterMovement()->RotationRate=FRotator(0,540,0);
    bUseControllerRotationYaw=false;
    GetMesh()->SetRelativeLocation(FVector(0,0,-90));
    Boom=CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
    Boom->SetupAttachment(RootComponent);
    Boom->TargetArmLength=340;
    Boom->SocketOffset=FVector(0,45,65);
    Boom->bUsePawnControlRotation=true;
    Camera=CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(Boom);
}

void APhillyCharacter::SetupPlayerInputComponent(UInputComponent* Input)
{
    Super::SetupPlayerInputComponent(Input);
    Input->BindAxis("MoveForward",this,&APhillyCharacter::Forward);
    Input->BindAxis("MoveRight",this,&APhillyCharacter::Right);
    Input->BindAxis("Turn",this,&APhillyCharacter::Turn);
    Input->BindAxis("LookUp",this,&APhillyCharacter::Look);
    Input->BindAction("Jump",IE_Pressed,this,&ACharacter::Jump);
    Input->BindAction("Jump",IE_Released,this,&ACharacter::StopJumping);
    Input->BindAction("Sprint",IE_Pressed,this,&APhillyCharacter::SprintOn);
    Input->BindAction("Sprint",IE_Released,this,&APhillyCharacter::SprintOff);
    Input->BindAction("EnterExit",IE_Pressed,this,&APhillyCharacter::EnterVehicle);
    Input->BindAction("Save",IE_Pressed,this,&APhillyCharacter::Save);
    Input->BindAction("Load",IE_Pressed,this,&APhillyCharacter::Load);
}
void APhillyCharacter::BeginPlay()
{
    Super::BeginPlay();
    // Daylight evaluation uses the same neutral exposure in actual walking and
    // street reviews. The darker aerial landmark exposure is camera-specific.
    auto& Exposure=Camera->PostProcessSettings;
    Exposure.bOverride_AutoExposureMethod=true;
    Exposure.AutoExposureMethod=AEM_Manual;
    Exposure.bOverride_AutoExposureApplyPhysicalCameraExposure=true;
    Exposure.AutoExposureApplyPhysicalCameraExposure=false;
    Exposure.bOverride_AutoExposureBias=true;
    Exposure.AutoExposureBias=0.f;
    auto* CharacterAsset=LoadObject<USkeletalMesh>(nullptr,TEXT("/Game/Philadelphia/Assets/Human/human-motion.human-motion"));
    IdleAnimation=LoadObject<UAnimSequence>(nullptr,TEXT("/Game/Philadelphia/Assets/Human/human-motionIdle.human-motionIdle"));
    WalkAnimation=LoadObject<UAnimSequence>(nullptr,TEXT("/Game/Philadelphia/Assets/Human/human-motionWalk.human-motionWalk"));
    RunAnimation=LoadObject<UAnimSequence>(nullptr,TEXT("/Game/Philadelphia/Assets/Human/human-motionRun.human-motionRun"));
    if(CharacterAsset) GetMesh()->SetSkeletalMeshAsset(CharacterAsset);
    else UE_LOG(LogTemp,Error,TEXT("PHILLY character asset missing"));
    GetMesh()->SetRelativeRotation(FRotator(0,-90,0));
}
void APhillyCharacter::Forward(float V) { if(Controller) AddMovementInput(FRotationMatrix(FRotator(0,Controller->GetControlRotation().Yaw,0)).GetUnitAxis(EAxis::X),V); }
void APhillyCharacter::Right(float V) { if(Controller) AddMovementInput(FRotationMatrix(FRotator(0,Controller->GetControlRotation().Yaw,0)).GetUnitAxis(EAxis::Y),V); }
void APhillyCharacter::SprintOn() { GetCharacterMovement()->MaxWalkSpeed=520; }
void APhillyCharacter::SprintOff() { GetCharacterMovement()->MaxWalkSpeed=180; }
void APhillyCharacter::Tick(float Dt)
{
    Super::Tick(Dt);
    const float Speed=GetVelocity().Size2D();
    UAnimSequence* Desired=Speed<5?IdleAnimation.Get():Speed>260?RunAnimation.Get():WalkAnimation.Get();
    if(Desired && Desired!=CurrentAnimation) {GetMesh()->PlayAnimation(Desired,true);CurrentAnimation=Desired;}
    if(Desired && Speed>=5) GetMesh()->SetPlayRate(FMath::Clamp(Speed/(Speed>260?375.f:94.f),.5f,1.8f));
}
void APhillyCharacter::EnterVehicle() { if(auto* G=Cast<APhillyGameMode>(GetWorld()->GetAuthGameMode())) G->SetDriving(true); }
void APhillyCharacter::Save() { if(auto* G=Cast<APhillyGameMode>(GetWorld()->GetAuthGameMode())) G->SaveProgress(); }
void APhillyCharacter::Load() { if(auto* G=Cast<APhillyGameMode>(GetWorld()->GetAuthGameMode())) G->LoadProgress(); }

APhillyGameMode::APhillyGameMode() { DefaultPawnClass=APhillyCharacter::StaticClass(); HUDClass=APhillyHUD::StaticClass(); PrimaryActorTick.bCanEverTick=true; }
void APhillyGameMode::BeginPlay()
{
    Super::BeginPlay();
    Walker=Cast<APhillyCharacter>(UGameplayStatics::GetPlayerPawn(this,0));
    for(TActorIterator<APhillyVehicle> It(GetWorld());It;++It) { Vehicle=*It; break; }
    StartedAt=FPlatformTime::Seconds();
    LastFrameAt=StartedAt;
    bEvaluation=FParse::Param(FCommandLine::Get(),TEXT("PhillyEvaluation"));
    FString Neighborhood;
    const bool HasNeighborhood=FParse::Value(FCommandLine::Get(),TEXT("PhillyNeighborhood="),Neighborhood);
    const bool SafeNeighborhood=!Neighborhood.IsEmpty() && Neighborhood.Len()<=48 &&
        !Neighborhood.Contains(TEXT("..")) && !Neighborhood.Contains(TEXT("/")) && !Neighborhood.Contains(TEXT("\\")) && !Neighborhood.Contains(TEXT(":"));
    if(HasNeighborhood && SafeNeighborhood && Walker)
    {
        FString Text;TSharedPtr<FJsonObject> Pack;
        const FString Path=FPaths::ProjectContentDir()/TEXT("SourceData")/Neighborhood/TEXT("manifest.json");
        if(FFileHelper::LoadFileToString(Text,*Path) && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),Pack))
        {
            const TArray<TSharedPtr<FJsonValue>>* P=nullptr;
            double YawValue=0;
            if(Pack->TryGetArrayField(TEXT("spawn"),P) && P->Num()==3 && Pack->TryGetNumberField(TEXT("yawDegrees"),YawValue))
            {
                const FVector Position((*P)[0]->AsNumber(),(*P)[1]->AsNumber(),(*P)[2]->AsNumber());
                const float Yaw=YawValue;
                if(!Position.ContainsNaN() && FMath::IsFinite(Yaw))
                {
                    FString Display;
                    NeighborhoodDisplayName=Pack->TryGetStringField(TEXT("name"),Display)?Display.ToUpper():Neighborhood.ToUpper();
                    Walker->SetActorLocation(Position,false,nullptr,ETeleportType::TeleportPhysics);
                    // Cell geometry and its collision cook arrive asynchronously.
                    // Hold the pawn until the actual local surface is available.
                    PendingSpawnPosition=Position;
                    PendingSpawnRotation=FRotator(-6,Yaw,0);
                    bWaitingForSpawnGround=true;
                    Walker->GetCharacterMovement()->StopMovementImmediately();
                    Walker->GetCharacterMovement()->DisableMovement();
                    Walker->GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
                    Walker->SetActorRotation(FRotator(0,Yaw,0));
                    if(auto* PC=UGameplayStatics::GetPlayerController(this,0))PC->SetControlRotation(FRotator(-6,Yaw,0));
                    if(Vehicle){Vehicle->SetActorLocation(Position+FVector(260,0,40),false,nullptr,ETeleportType::TeleportPhysics);Vehicle->SetActorRotation(FRotator(0,Yaw,0),ETeleportType::TeleportPhysics);}
                    UE_LOG(LogTemp,Display,TEXT("PHILLY_NATIVE_START %s position=%s yaw=%.2f"),*Neighborhood,*Position.ToString(),Yaw);
                }
            }
        }
        else UE_LOG(LogTemp,Error,TEXT("PHILLY_NATIVE_START missing %s source pack"),*Neighborhood);
    }
    if(FParse::Param(FCommandLine::Get(),TEXT("PhillyForwardSky")))
    {
        // Forward shading needs sky geometry with an IsSky material. Sample the
        // existing atmosphere rather than substituting a flat background color.
        auto* Sphere=LoadObject<UStaticMesh>(nullptr,TEXT("/Engine/BasicShapes/Sphere.Sphere"));
        auto* SkyMaterial=LoadObject<UMaterialInterface>(nullptr,TEXT("/Game/Philadelphia/Materials/M_ForwardAtmosphereSky.M_ForwardAtmosphereSky"));
        if(Sphere && SkyMaterial)
        {
            auto* Dome=GetWorld()->SpawnActor<AStaticMeshActor>();
            Dome->SetActorEnableCollision(false);
            auto* Mesh=Dome->GetStaticMeshComponent();
            // SetCollisionEnabled alone leaves bUseDefaultCollision active on
            // static meshes; a later physics rebuild can restore asset collision.
            Mesh->SetCollisionProfileName(TEXT("NoCollision"));
            Mesh->SetCanEverAffectNavigation(false);
            Mesh->SetMobility(EComponentMobility::Movable);
            Mesh->SetStaticMesh(Sphere);
            Mesh->SetMaterial(0,SkyMaterial);
            Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
            Mesh->SetCastShadow(false);
            Mesh->bAffectDistanceFieldLighting=false;
            Dome->SetActorScale3D(FVector(100000));
            UE_LOG(LogTemp,Display,TEXT("PHILLY_FORWARD_SKY atmosphere material on 50km sphere; actor_collision=%d mesh_collision=%d profile=%s shadows=0"),Dome->GetActorEnableCollision(),int32(Mesh->GetCollisionEnabled()),*Mesh->GetCollisionProfileName().ToString());
        }
        else UE_LOG(LogTemp,Error,TEXT("PHILLY_FORWARD_SKY missing sphere or prepared material"));
    }
    bReadingTerminalReview=FParse::Param(FCommandLine::Get(),TEXT("PhillyReadingTerminalReview"));
    bArchStreetReview=FParse::Param(FCommandLine::Get(),TEXT("PhillyArchStreetReview"));
    bArchStreetPlayerReview=FParse::Param(FCommandLine::Get(),TEXT("PhillyArchStreetPlayerReview"));
    bCityHallReview=FParse::Param(FCommandLine::Get(),TEXT("PhillyCityHallReview")) || bReadingTerminalReview || bArchStreetReview;
    if(bArchStreetPlayerReview)
    {
        // This optional review uses the real possessed pawn and its spring arm.
        // Its location is projected onto retained Arch Street and grounded on
        // the exported road triangle by prepare-arch-street-review.py.
        bCityHallReview=false;
        bArchStreetReview=false;
        bReadingTerminalReview=false;
        FString Text;
        TSharedPtr<FJsonObject> Review;
        const FString Path=FPaths::ProjectContentDir()/TEXT("SourceData/arch-street-review.json");
        const bool Loaded=FFileHelper::LoadFileToString(Text,*Path) && FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text),Review);
        const TArray<TSharedPtr<FJsonValue>>* PositionValues=nullptr;
        double Yaw=0,Pitch=0;
        auto* PC=UGameplayStatics::GetPlayerController(this,0);
        if(!Loaded || !Review.IsValid() || !Review->TryGetArrayField(TEXT("pawnCm"),PositionValues) || PositionValues->Num()!=3 ||
            !Review->TryGetNumberField(TEXT("yawDegrees"),Yaw) || !Review->TryGetNumberField(TEXT("pitchDegrees"),Pitch) || !Walker || !PC)
        {
            UE_LOG(LogTemp,Error,TEXT("PHILLY_ARCH_PLAYER_REVIEW invalid source position or player"));
            bEvaluation=false;
            return;
        }
        FVector Position;
        for(int32 I=0;I<3;I++)
        {
            double Value=0;
            if(!(*PositionValues)[I]->TryGetNumber(Value) || !FMath::IsFinite(Value))
            {UE_LOG(LogTemp,Error,TEXT("PHILLY_ARCH_PLAYER_REVIEW invalid coordinate"));bEvaluation=false;return;}
            Position[I]=Value;
        }
        if(!FMath::IsFinite(Yaw) || !FMath::IsFinite(Pitch))
        {UE_LOG(LogTemp,Error,TEXT("PHILLY_ARCH_PLAYER_REVIEW invalid orientation"));bEvaluation=false;return;}
        Walker->SetActorLocation(Position,false,nullptr,ETeleportType::TeleportPhysics);
        StreetReviewPosition=Position;
        Walker->SetActorRotation(FRotator(0,Yaw,0));
        PC->SetControlRotation(FRotator(Pitch,Yaw,0));
        PC->SetViewTarget(Walker);
        Walker->DisableInput(PC);
        PC->SetIgnoreMoveInput(true);
        PC->SetIgnoreLookInput(true);
        auto& Exposure=Walker->Camera->PostProcessSettings;
        Exposure.bOverride_AutoExposureMethod=true;
        Exposure.AutoExposureMethod=AEM_Manual;
        Exposure.bOverride_AutoExposureApplyPhysicalCameraExposure=true;
        Exposure.AutoExposureApplyPhysicalCameraExposure=false;
        Exposure.bOverride_AutoExposureBias=true;
        float StreetExposure=0.f;
        FParse::Value(FCommandLine::Get(),TEXT("PhillyReviewExposure="),StreetExposure);
        Exposure.AutoExposureBias=FMath::Clamp(StreetExposure,-6.f,6.f);
        bEvaluation=true;
        UE_LOG(LogTemp,Display,TEXT("PHILLY_ARCH_PLAYER_REVIEW source_road=13636 position=%s yaw=%.3f pitch=%.3f exposure_bias=%.2f"),*Position.ToString(),Yaw,Pitch,Exposure.AutoExposureBias);
    }
    if(bCityHallReview)
    {
        bool Found=false;
        for(TActorIterator<AActor> It(GetWorld());It;++It)
        {
            if(!It->ActorHasTag(bArchStreetReview?TEXT("ArchStreetOriginal"):bReadingTerminalReview?TEXT("ReadingTerminalOriginal"):TEXT("CityHallOriginal")))continue;
            FVector Target=It->GetActorLocation()+FVector(0,1700,-1600);
            FVector Position=It->GetActorLocation()+FVector(-33000,48000,24000);
            if(bReadingTerminalReview || bArchStreetReview)
            {
                const FBox Bounds=It->GetComponentsBoundingBox();
                Target=Bounds.GetCenter();
                Position=Target+FVector(-.6f,.85f,.6f).GetSafeNormal()*Bounds.GetExtent().Size()*4.8f;
            }
            auto* CameraActor=GetWorld()->SpawnActor<ACameraActor>(Position,(Target-Position).Rotation());
            auto* PC=UGameplayStatics::GetPlayerController(this,0);
            if(CameraActor && PC)
            {
                CameraActor->GetCameraComponent()->SetFieldOfView(45);
                auto& Exposure=CameraActor->GetCameraComponent()->PostProcessSettings;
                // Fixed exposure keeps the incomplete dark surroundings from
                // driving automatic metering and bleaching the source photos.
                Exposure.bOverride_AutoExposureMethod=true;
                Exposure.AutoExposureMethod=AEM_Manual;
                Exposure.bOverride_AutoExposureApplyPhysicalCameraExposure=true;
                Exposure.AutoExposureApplyPhysicalCameraExposure=false;
                Exposure.bOverride_AutoExposureBias=true;
                float ReviewExposure=-2.f;
                FParse::Value(FCommandLine::Get(),TEXT("PhillyReviewExposure="),ReviewExposure);
                Exposure.AutoExposureBias=FMath::Clamp(ReviewExposure,-6.f,6.f);
                UE_LOG(LogTemp,Display,TEXT("PHILLY_CITY_HALL_CAMERA exposure_bias=%.2f position=%s target=%s"),Exposure.AutoExposureBias,*Position.ToString(),*Target.ToString());
                PC->SetViewTarget(CameraActor);
                bEvaluation=true;
                Found=true;
            }
            break;
        }
        if(!Found)UE_LOG(LogTemp,Error,TEXT("PHILLY_CITY_HALL_REVIEW missing source actor or camera"));
    }
    if(FParse::Param(FCommandLine::Get(),TEXT("PhillyMechanicsProbe")) || FParse::Param(FCommandLine::Get(),TEXT("PhillyWalkProbe")))GetWorld()->SpawnActor<APhillyMechanicsProbe>();
}
void APhillyGameMode::Tick(float Dt)
{
    Super::Tick(Dt);
    if(!Walker) Walker=Cast<APhillyCharacter>(UGameplayStatics::GetPlayerPawn(this,0));
    if(Walker && bWaitingForSpawnGround)
    {
        int32 Ready=0;
        for(TActorIterator<APhillyDistrict> It(GetWorld());It;++It)Ready+=It->ReadyCells;
        FHitResult Ground;
        FCollisionQueryParams Query(SCENE_QUERY_STAT(PhillySpawnGround),true,Walker);
        if(Vehicle)Query.AddIgnoredActor(Vehicle);
        if(Ready>=20 && GetWorld()->LineTraceSingleByChannel(Ground,PendingSpawnPosition+FVector(0,0,500),PendingSpawnPosition-FVector(0,0,1000),ECC_Visibility,Query)
            && Ground.ImpactNormal.Z>.65 && Cast<APhillyDistrict>(Ground.GetActor()))
        {
            const FVector SafePosition(Ground.ImpactPoint.X,Ground.ImpactPoint.Y,Ground.ImpactPoint.Z+Walker->GetCapsuleComponent()->GetScaledCapsuleHalfHeight()+2);
            Walker->SetActorLocation(SafePosition,false,nullptr,ETeleportType::TeleportPhysics);
            Walker->GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
            Walker->GetCharacterMovement()->SetMovementMode(MOVE_Walking);
            if(auto* PC=UGameplayStatics::GetPlayerController(this,0))
            {
                PC->SetControlRotation(PendingSpawnRotation);
                if(FParse::Param(FCommandLine::Get(),TEXT("PhillyWalkProbe")))PC->SetIgnoreLookInput(true);
                // Fixed native player-camera art review, explicitly separate
                // from traversal acceptance. This never runs in normal play.
                if(FParse::Param(FCommandLine::Get(),TEXT("PhillyMuseumArtReview")))
                {
                    FVector ArtPosition(-172957.311,-168657.821,1600.623);
                    float ArtYaw=-140,ArtPitch=-6;
                    FParse::Value(FCommandLine::Get(),TEXT("PhillyArtX="),ArtPosition.X);
                    FParse::Value(FCommandLine::Get(),TEXT("PhillyArtY="),ArtPosition.Y);
                    FParse::Value(FCommandLine::Get(),TEXT("PhillyArtZ="),ArtPosition.Z);
                    FParse::Value(FCommandLine::Get(),TEXT("PhillyArtYaw="),ArtYaw);
                    FParse::Value(FCommandLine::Get(),TEXT("PhillyArtPitch="),ArtPitch);
                    Walker->SetActorLocation(ArtPosition,false,nullptr,ETeleportType::TeleportPhysics);
                    Walker->SetActorRotation(FRotator(0,ArtYaw,0));
                    Walker->GetCharacterMovement()->DisableMovement();
                    Walker->GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
                    Walker->DisableInput(PC);PC->SetIgnoreMoveInput(true);PC->SetIgnoreLookInput(true);
                    PC->SetControlRotation(FRotator(ArtPitch,ArtYaw,0));
                    UE_LOG(LogTemp,Display,TEXT("PHILLY_ART_REVIEW position=%s yaw=%.2f pitch=%.2f visual_only=1"),*ArtPosition.ToString(),ArtYaw,ArtPitch);
                }
            }
            bWaitingForSpawnGround=false;
            UE_LOG(LogTemp,Display,TEXT("PHILLY_SPAWN_GROUNDED position=%s cells=%d"),*SafePosition.ToString(),Ready);
        }
        else return;
    }
    if(!bEvaluation || !Walker)return;
    if(bArchStreetPlayerReview && (FVector::DistSquaredXY(Walker->GetActorLocation(),StreetReviewPosition)>FMath::Square(25.f) || FMath::Abs(Walker->GetActorLocation().Z-StreetReviewPosition.Z)>100.f))
    {
        const FString Failure=FString::Printf(TEXT("Invalid stationary review: pawn moved from %s to %s. No performance result accepted.\n"),*StreetReviewPosition.ToString(),*Walker->GetActorLocation().ToString());
        FFileHelper::SaveStringToFile(Failure,*(FPaths::ProjectSavedDir()/TEXT("arch-street-player-review-invalid.txt")));
        UE_LOG(LogTemp,Error,TEXT("PHILLY_ARCH_PLAYER_INVALID %s"),*Failure);
        bEvaluation=false;
        return;
    }
    const double Now=FPlatformTime::Seconds();
    // BeginPlay can precede first-render asset compilation by tens of seconds.
    // Start the stationary warm-up clock only after 60 actual game frames.
    // Hitches during the subsequent measured window are retained, never filtered.
    if(EvaluationWarmupFrames++<60)
    {
        StartedAt=LastFrameAt=Now;
        return;
    }
    const double Elapsed=Now-StartedAt;
    const double FrameMs=(Now-LastFrameAt)*1000;
    LastFrameAt=Now;
    if(Elapsed>20 && Elapsed<50)
    {
        FrameTimes.Add(FrameMs);
        const uint32 GPUCycles=RHIGetGPUFrameCycles();
        if(GPUCycles) GPUFrameTimes.Add(FPlatformTime::ToMilliseconds(GPUCycles));
    }
    // Screenshot readback/compression is verification work, not normal gameplay.
    // Request it only after the full frame-time interval has ended.
    if(Elapsed>50 && !bCaptureRequested)
    {
        const FString Directory=FPaths::ConvertRelativePathToFull(FPaths::ProjectSavedDir()/TEXT("Screenshots"));
        IFileManager::Get().MakeDirectory(*Directory,true);
        FScreenshotRequest::RequestScreenshot(Directory/(bArchStreetPlayerReview?TEXT("NativeArchStreetPlayer.png"):bArchStreetReview?TEXT("NativeArchStreet.png"):bReadingTerminalReview?TEXT("NativeReadingTerminal.png"):bCityHallReview?TEXT("NativeCityHall.png"):TEXT("NativeChinatown.png")),true,false);
        if(bArchStreetPlayerReview)UE_LOG(LogTemp,Display,TEXT("PHILLY_ARCH_PLAYER_CAPTURE position=%s grounded=%d"),*Walker->GetActorLocation().ToString(),Walker->GetCharacterMovement()->IsMovingOnGround());
        bCaptureRequested=true;
    }
    if(Elapsed>50 && FrameTimes.Num())
    {
        FrameTimes.Sort();
        double Sum=0;for(double V:FrameTimes)Sum+=V;
        const auto Memory=FPlatformMemory::GetStats();
        FIntPoint Size=GEngine && GEngine->GameViewport && GEngine->GameViewport->Viewport?GEngine->GameViewport->Viewport->GetSizeXY():FIntPoint::ZeroValue;
        const TCHAR* Scope=bArchStreetPlayerReview?TEXT("stationary_arch_street_player_review"):bArchStreetReview?TEXT("stationary_arch_street_asset_review"):bReadingTerminalReview?TEXT("stationary_reading_terminal_asset_review"):bCityHallReview?TEXT("stationary_city_hall_asset_review"):TEXT("stationary_native_source_evaluation");
        const FString Csv=FString::Printf(TEXT("scope,frames,mean_ms,p95_ms,p99_ms,process_ram_bytes,required_fps,width,height\n%s,%d,%.3f,%.3f,%.3f,%llu,60,%d,%d\n"),Scope,FrameTimes.Num(),Sum/FrameTimes.Num(),FrameTimes[FMath::Min(FrameTimes.Num()-1,int32(FrameTimes.Num()*.95))],FrameTimes[FMath::Min(FrameTimes.Num()-1,int32(FrameTimes.Num()*.99))],static_cast<unsigned long long>(Memory.UsedPhysical),Size.X,Size.Y);
        FFileHelper::SaveStringToFile(Csv,*(FPaths::ProjectSavedDir()/(bArchStreetPlayerReview?TEXT("arch-street-player-frame-sample.csv"):bArchStreetReview?TEXT("arch-street-frame-sample.csv"):bReadingTerminalReview?TEXT("reading-terminal-frame-sample.csv"):bCityHallReview?TEXT("city-hall-frame-sample.csv"):TEXT("native-frame-sample.csv"))));
        if(GPUFrameTimes.Num())
        {
            GPUFrameTimes.Sort();
            double GPUSum=0;for(double V:GPUFrameTimes)GPUSum+=V;
            const FString GPUCsv=FString::Printf(TEXT("scope,samples,mean_gpu_ms,p95_gpu_ms\n%s,%d,%.3f,%.3f\n"),Scope,GPUFrameTimes.Num(),GPUSum/GPUFrameTimes.Num(),GPUFrameTimes[FMath::Min(GPUFrameTimes.Num()-1,int32(GPUFrameTimes.Num()*.95))]);
            FFileHelper::SaveStringToFile(GPUCsv,*(FPaths::ProjectSavedDir()/(bArchStreetPlayerReview?TEXT("arch-street-player-gpu-sample.csv"):bArchStreetReview?TEXT("arch-street-gpu-sample.csv"):bReadingTerminalReview?TEXT("reading-terminal-gpu-sample.csv"):bCityHallReview?TEXT("city-hall-gpu-sample.csv"):TEXT("native-gpu-sample.csv"))));
        }
        UE_LOG(LogTemp,Display,TEXT("PHILLY_EVALUATION %s"),*Csv);
        bEvaluation=false;
        // An opt-in renderer breakdown runs after the frame-time sample so its
        // synchronization cost cannot contaminate the reported frame distribution.
        if(GEngine && FParse::Param(FCommandLine::Get(),TEXT("PhillyGPUProfile")))
        {
            GEngine->Exec(GetWorld(),TEXT("r.ProfileGPU.ShowUI 0"));
            GEngine->Exec(GetWorld(),TEXT("ProfileGPU"));
        }
    }
}
bool APhillyGameMode::SetDriving(bool Driving)
{
    auto* PC=UGameplayStatics::GetPlayerController(this,0);
    if(!PC || !Walker || !Vehicle) return false;
    if(Driving)
    {
        if(PC->GetPawn()!=Walker || FVector::Dist(Walker->GetActorLocation(),Vehicle->GetActorLocation())>450) return false;
        Walker->GetCharacterMovement()->StopMovementImmediately();
        Walker->SetActorHiddenInGame(true);
        Walker->SetActorEnableCollision(false);
        PC->Possess(Vehicle);
    }
    else
    {
        if(PC->GetPawn()!=Vehicle || Vehicle->SpeedKmh()>8) return false;
        bool Found=false;
        FVector Exit;
        for(float Side:{1.f,-1.f})
        {
            const FVector P=Vehicle->GetActorLocation()+Vehicle->GetActorRightVector()*Side*190;
            FHitResult Ground;
            FCollisionQueryParams Query(SCENE_QUERY_STAT(PhillyExit),false,Vehicle);
            Query.AddIgnoredActor(Walker);
            if(!GetWorld()->LineTraceSingleByChannel(Ground,P+FVector(0,0,200),P-FVector(0,0,400),ECC_Visibility,Query)) continue;
            Exit=Ground.ImpactPoint+FVector(0,0,94);
            if(!GetWorld()->OverlapBlockingTestByChannel(Exit,FQuat::Identity,ECC_Pawn,FCollisionShape::MakeCapsule(34,90),Query)) {Found=true;break;}
        }
        if(!Found) return false;
        Walker->SetActorLocation(Exit,false,nullptr,ETeleportType::TeleportPhysics);
        Walker->SetActorHiddenInGame(false);
        Walker->SetActorEnableCollision(true);
        PC->Possess(Walker);
    }
    UE_LOG(LogTemp,Display,TEXT("PHILLY_MODE %s"),Driving?TEXT("DRIVE"):TEXT("WALK"));
    return true;
}
bool APhillyGameMode::SaveProgress()
{
    if(!Walker || !Vehicle) return false;
    auto* Save=Cast<UPhillySave>(UGameplayStatics::CreateSaveGameObject(UPhillySave::StaticClass()));
    Save->Player=Walker->GetActorTransform(); Save->Vehicle=Vehicle->GetActorTransform();
    Save->bDriving=UGameplayStatics::GetPlayerPawn(this,0)==Vehicle;
    const TCHAR* Slot=FParse::Param(FCommandLine::Get(),TEXT("PhillyMechanicsProbe"))?TEXT("PhiladelphiaMechanicsProbe"):TEXT("PhiladelphiaEvaluation");
    const bool Success=UGameplayStatics::SaveGameToSlot(Save,Slot,0);
    UE_LOG(LogTemp,Display,TEXT("PHILLY_SAVE %d"),Success);
    return Success;
}
bool APhillyGameMode::LoadProgress()
{
    const TCHAR* Slot=FParse::Param(FCommandLine::Get(),TEXT("PhillyMechanicsProbe"))?TEXT("PhiladelphiaMechanicsProbe"):TEXT("PhiladelphiaEvaluation");
    auto* Save=Cast<UPhillySave>(UGameplayStatics::LoadGameFromSlot(Slot,0));
    auto* PC=UGameplayStatics::GetPlayerController(this,0);
    if(!Save || Save->Version!=1 || !Walker || !Vehicle || !PC || Save->Player.ContainsNaN() || Save->Vehicle.ContainsNaN()) return false;
    Vehicle->Body->SetPhysicsLinearVelocity(FVector::ZeroVector);
    Vehicle->Body->SetPhysicsAngularVelocityInDegrees(FVector::ZeroVector);
    Vehicle->SetActorTransform(Save->Vehicle,false,nullptr,ETeleportType::TeleportPhysics);
    Walker->SetActorTransform(Save->Player,false,nullptr,ETeleportType::TeleportPhysics);
    Walker->GetCharacterMovement()->StopMovementImmediately();
    Walker->SetActorHiddenInGame(Save->bDriving); Walker->SetActorEnableCollision(!Save->bDriving);
    PC->Possess(Save->bDriving?static_cast<APawn*>(Vehicle):static_cast<APawn*>(Walker));
    UE_LOG(LogTemp,Display,TEXT("PHILLY_LOAD restored transforms and possession"));
    return true;
}
void APhillyHUD::DrawHUD()
{
    Super::DrawHUD();
    if(FParse::Param(FCommandLine::Get(),TEXT("PhillyArchStreetPlayerReview")))
    {
        DrawText(TEXT("ARCH STREET / PLAYER CAMERA REVIEW"),FLinearColor::White,28,25,nullptr,1.2f);
        DrawText(TEXT("Stationary measurement - controls locked"),FLinearColor::White,28,55);
        return;
    }
    const bool ReadingTerminal=FParse::Param(FCommandLine::Get(),TEXT("PhillyReadingTerminalReview"));
    const bool ArchStreet=FParse::Param(FCommandLine::Get(),TEXT("PhillyArchStreetReview"));
    if(FParse::Param(FCommandLine::Get(),TEXT("PhillyCityHallReview")) || ReadingTerminal || ArchStreet)
    {
        DrawText(ArchStreet?TEXT("ARCH STREET / ORIGINAL SOURCE BUILDINGS"):ReadingTerminal?TEXT("READING TERMINAL / ORIGINAL SOURCE BUILDINGS"):TEXT("PHILADELPHIA CITY HALL / ORIGINAL SOURCE ASSET"),FLinearColor::White,28,25,nullptr,1.2f);
        DrawText(TEXT("Native material comparison - district gameplay remains unfinished"),FLinearColor::White,28,55);
        return;
    }
    const auto* Vehicle=Cast<APhillyVehicle>(GetOwningPawn());
    const FString Status=Vehicle?FString::Printf(TEXT("DRIVE   %.0f km/h"),Vehicle->SpeedKmh()):TEXT("WALK");
    const auto* Mode=Cast<APhillyGameMode>(GetWorld()->GetAuthGameMode());
    const FString Place=Mode?Mode->NeighborhoodDisplayName:TEXT("CHINATOWN");
    DrawText(TEXT("PHILADELPHIA  /  ")+Place,FLinearColor::White,28,25,nullptr,1.35f);
    DrawText(Status,FLinearColor(.6f,.9f,1),28,55);
    DrawText(TEXT("WASD move   Mouse look   F enter/exit   Shift run   Space jump/brake   F5 save   F9 load"),FLinearColor::White,28,Canvas->SizeY-40);
}
