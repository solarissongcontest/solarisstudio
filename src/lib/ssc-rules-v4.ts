// Compatibility entry point. The canonical implementation now lives in the
// modular src/lib/ssc-rules/ package; existing consumers keep working while
// imports migrate without duplicating rule definitions.
export * from "@/lib/ssc-rules/index";
