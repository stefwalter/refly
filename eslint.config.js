import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,
    {
        languageOptions: {
            "globals": {
                ...globals.browser
            }
        },
        rules: {
            "no-unused-vars": "error",
            "no-undef": "error",
            "semi": "error",
            "prefer-const": "error"
        }
    }
];
