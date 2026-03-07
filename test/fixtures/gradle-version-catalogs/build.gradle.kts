plugins {
    alias(buildLibs.plugins.kotlin.jvm)
}

dependencies {
    implementation(libs.jackson.databind)

    testImplementation(testLibs.junit.jupiter)
}
