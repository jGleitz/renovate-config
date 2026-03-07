plugins {
    alias(buildLibs.plugins.kotlin.jvm)
    alias(buildLibs.plugins.detekt)
}

dependencies {
    implementation(libs.jackson.databind)
    implementation(libs.jackson.kotlin)
    implementation(libs.slf4j.api)

    testImplementation(testLibs.junit.jupiter)
    testImplementation(testLibs.mockito.core)
}
