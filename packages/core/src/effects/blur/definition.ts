import { AMOUNT, SCALE, defineEffect } from "../definition";
/** Amount scales the authored standard deviation; transparent edges soften too. */
export const BLUR_DEFINITION = defineEffect("blur", {}, [AMOUNT, SCALE], "effect", "expand");
