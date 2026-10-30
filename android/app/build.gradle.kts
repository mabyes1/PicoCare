import org.jetbrains.kotlin.gradle.dsl.JvmTarget
plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "tw.picocare.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "tw.picocare.meta"
        minSdk = 26
        targetSdk = 35
        versionCode = 116
        versionName = "1.0.0-meta.16"
    }
    flavorDimensions += "side"
    productFlavors {
        create("elder") { dimension = "side"; manifestPlaceholders["appLabel"] = "PicoCare 實測" }
        create("care") { dimension = "side"; applicationId = "tw.picocare.meta.care"; manifestPlaceholders["appLabel"] = "PicoCare 照顧者" }
    }
    buildFeatures { buildConfig = true }
    buildTypes {
        getByName("debug") { signingConfig = null }
        getByName("release") { isMinifyEnabled = false; signingConfig = null }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    testOptions { unitTests.isIncludeAndroidResources = true }
}
kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }
dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
}
