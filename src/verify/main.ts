// Вход кураторской страницы verify.html.
import './verify.css';
import { createRestClientFromEnv } from '../services/rest';
import { mountVerifyPage } from './page';

const root = document.getElementById('ezq-verify');
if (root) mountVerifyPage(root, { rest: createRestClientFromEnv() });
