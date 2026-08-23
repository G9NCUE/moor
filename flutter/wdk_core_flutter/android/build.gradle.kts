group = "to.moor.wdk_core_flutter"
version = "1.0-SNAPSHOT"

buildscript {
    val kotlinVersion = "2.2.20"
    repositories {
        google()
        mavenCentral()
    }

    dependencies {
        classpath("com.android.tools.build:gradle:8.11.1")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

plugins {
    id("com.android.library")
    id("kotlin-android")
}

android {
    namespace = "to.moor.wdk_core_flutter"

    compileSdk = 36

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    sourceSets {
        getByName("main") {
            java.srcDirs("src/main/kotlin")
            // Two sets of native libs, both per-ABI:
            //   libs/bare-kit/jni   the Bare runtime itself, from holepunchto/bare-kit prebuilds.zip
            //   src/main/addons     the addons the worklet bundle links (bare-crypto, bare-dns, …),
            //                       emitted by `wdk-worklet-bundler generate` as android-addons/
            // Neither is committed; see ../../phase0/README.md.
            jniLibs.srcDirs("libs/bare-kit/jni", "src/main/addons")
            assets.srcDirs("src/main/assets")
        }
        getByName("test") {
            java.srcDirs("src/test/kotlin")
        }
    }

    defaultConfig {
        // wdk-core-kotlin's floor; BareKit is built against it.
        minSdk = 33
    }

    packaging {
        // libc++_shared.so ships in both sets above; they are the same library.
        jniLibs.pickFirsts.add("**/libc++_shared.so")
    }
}

dependencies {
    api(files("libs/bare-kit/classes.jar"))
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
