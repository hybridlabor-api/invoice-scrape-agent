const inquirer = require('inquirer').default || require('inquirer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const envPath = path.join(__dirname, '.env');

(async () => {
  console.log("======================================================");
  console.log("       🤖 Uber Invoice Agent - LLM Setup 🤖        ");
  console.log("======================================================\n");

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Welchen LLM-Anbieter möchtest du für die PDF-Analyse nutzen?',
      choices: [
        'Gemini (Google)',
        'Claude (Anthropic)',
        'OpenAI (ChatGPT)',
        'Groq',
        'OpenRouter',
        'Ollama (Lokal)',
        'Grok (xAI)',
        'Nvidia',
        'Manuelles JSON Format'
      ]
    },
    {
      type: 'input',
      name: 'apiKey',
      message: 'Bitte gib deinen API Key ein (oder drücke Enter für lokales LLM/später):',
      when: (answers) => answers.provider !== 'Ollama (Lokal)' && answers.provider !== 'Manuelles JSON Format'
    },
    {
      type: 'input',
      name: 'modelName',
      message: 'Welches Modell soll verwendet werden? (Standard: gemini-2.5-flash / gpt-4o-mini / etc.):',
      default: (answers) => {
        if(answers.provider.includes('Gemini')) return 'gemini-2.5-flash';
        if(answers.provider.includes('OpenAI')) return 'gpt-4o-mini';
        if(answers.provider.includes('Claude')) return 'claude-3-5-haiku-20241022';
        if(answers.provider.includes('Groq')) return 'llama-3.3-70b-versatile';
        if(answers.provider.includes('OpenRouter')) return 'google/gemini-2.5-flash';
        if(answers.provider.includes('Ollama')) return 'llama3.2';
        return '';
      },
      when: (answers) => answers.provider !== 'Manuelles JSON Format'
    }
  ]);

  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  // Helper to replace or add env var
  const setEnv = (key, value) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (envContent.match(regex)) {
      envContent = envContent.replace(regex, `${key}="${value}"`);
    } else {
      envContent += `\n${key}="${value}"`;
    }
  };

  setEnv('LLM_PROVIDER', answers.provider);
  
  if (answers.apiKey) {
    setEnv('LLM_API_KEY', answers.apiKey);
  }
  
  if (answers.modelName) {
    setEnv('LLM_MODEL', answers.modelName);
  }

  fs.writeFileSync(envPath, envContent.trim() + '\n');
  console.log("\n✅ LLM-Konfiguration erfolgreich in .env gespeichert!");

  console.log("\nStarte nun den automatischen Uber-Login...");
  try {
    execSync('node auth.js', { stdio: 'inherit' });
  } catch(e) {
    console.log("Auto-Login abgebrochen oder fehlgeschlagen.");
  }
  
})();
