const {withAppBuildGradle}=require('expo/config-plugins');
const marker='// Hankan: track shared .mjs recognition rules in incremental APK builds.';
const block=`
${marker}
tasks.withType(com.facebook.react.tasks.BundleHermesCTask).configureEach {
    inputs.files(fileTree(dir: projectRoot, includes: ['src/**/*.mjs', 'app.json']))
        .withPropertyName('hankanModuleSources')
        .withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
}
`;
module.exports=config=>withAppBuildGradle(config,mod=>{
    if(mod.modResults.language!=='groovy')throw new Error('Hankan build inputs require Groovy app/build.gradle.');
    if(!mod.modResults.contents.includes(marker))mod.modResults.contents+=block;
    return mod;
});
