plugins {
    alias(buildLibs.plugins.kotlin.jvm)
    alias(buildLibs.plugins.detekt)
}

dependencies {
    implementation(libs.jackson.databind)
    implementation(libs.slf4j.api)
    implementation(libs.commons.lang3)

    testImplementation(testLibs.junit.jupiter)
    testImplementation(testLibs.mockito.core)
    testImplementation(testLibs.assertj.core)
}
