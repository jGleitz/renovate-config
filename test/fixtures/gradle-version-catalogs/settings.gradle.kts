plugins {
    id("com.gradle.develocity") version "3.17"
}

dependencyResolutionManagement {
    versionCatalogs {
        create("testLibs") {
            from(files("gradle/testLibs.versions.toml"))
        }
        create("buildLibs") {
            from(files("gradle/buildLibs.versions.toml"))
        }
    }
}

rootProject.name = "example-project"
