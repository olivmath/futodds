# kotlinx.serialization — keep serializers for reflective lookup
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class **.*$Companion {
    kotlinx.serialization.KSerializer serializer(...);
}

# Mobile Wallet Adapter / Solana libraries
-keep class com.solana.** { *; }
-keep class com.solanamobile.** { *; }
-keep class com.funkatronics.** { *; }
