dependencyResolutionManagement {
    versionCatalogs {
        create("testLibs") { from(files("gradle/testLibs.versions.toml")) }
        create("buildLibs") { from(files("gradle/buildLibs.versions.toml")) }
    }
}

rootProject.name = "npm-catalog-example"
