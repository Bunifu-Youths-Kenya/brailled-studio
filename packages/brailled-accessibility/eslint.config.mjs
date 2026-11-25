import {eslintConfigScratch} from 'eslint-config-scratch';
import globals from 'globals';

export default eslintConfigScratch.defineConfig(
    eslintConfigScratch.legacy.base,
    {
        files: ['{src,test}/**/*.{js,jsx}'],
        extends: [
            eslintConfigScratch.legacy.es6,
            eslintConfigScratch.legacy.react
        ],
        languageOptions: {
            globals: globals.browser
        },
        settings: {
            react: {version: 'detect'}
        },
        rules: {
            // JSX compiles to React.createElement, so the React import is used.
            'react/jsx-uses-react': 'error'
        }
    },
    {
        files: ['src/outline/block-definitions.js', 'src/outline/outline-view.jsx'],
        languageOptions: {
            // webpack provides `require`, used to load scratch-blocks only when it is first needed.
            globals: {require: 'readonly'}
        }
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            globals: globals.jest
        }
    }
);
