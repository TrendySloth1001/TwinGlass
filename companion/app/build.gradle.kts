plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.mobmirror.companion"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mobmirror.companion"
        minSdk = 29
        targetSdk = 35
        versionCode = 11
        versionName = "0.8.0"
    }
    buildTypes {
        release {
            // R8 + resource shrinking: ~22 MB debug build -> a few MB (faster install / update).
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            // Signed with the local debug key so it updates the debug builds already on phones
            // (same signature). Real releases: a proper keystore (docs/RELEASE.md).
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
}

// Jetpack Compose + Material 3 (Material You colours on Android 12+).
dependencies {
    val bom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(bom)
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended") // R8 keeps only the icons used
    implementation("androidx.compose.ui:ui")
    // QR pairing: Google's code scanner UI (no camera permission; needs Google Play services).
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    // play-services pulls an old Fragment; ActivityResult APIs need 1.3+.
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    testImplementation("junit:junit:4.13.2")
}
