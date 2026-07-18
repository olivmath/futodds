plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.oddsdex.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.oddsdex.app"
        minSdk = 31
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    flavorDimensions += "cluster"
    productFlavors {
        create("devnet") {
            dimension = "cluster"
            applicationIdSuffix = ".devnet"
            versionNameSuffix = "-devnet"
            buildConfigField("String", "CLUSTER", "\"devnet\"")
            buildConfigField("String", "RPC_URL", "\"https://api.devnet.solana.com\"")
            // Devnet USDC mint comes from the program dev — placeholder until contract alignment (TODO.md Phase 4)
            buildConfigField("String", "USDC_MINT", "\"\"")
            buildConfigField("String", "API_BASE_URL", "\"\"")
            buildConfigField("String", "WS_URL", "\"\"")
        }
        create("mainnet") {
            dimension = "cluster"
            buildConfigField("String", "CLUSTER", "\"mainnet-beta\"")
            buildConfigField("String", "RPC_URL", "\"https://api.mainnet-beta.solana.com\"")
            // Confirm mint before launch (PRD §7.3)
            buildConfigField("String", "USDC_MINT", "\"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\"")
            buildConfigField("String", "API_BASE_URL", "\"\"")
            buildConfigField("String", "WS_URL", "\"\"")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets.all {
        kotlin.srcDir("src/$name/kotlin")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.security.crypto)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.client.websockets)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)

    implementation(libs.solana.mwa.clientlib.ktx)
    implementation(libs.solana.web3)
    implementation(libs.solana.rpc.core)
    implementation(libs.multimult)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
