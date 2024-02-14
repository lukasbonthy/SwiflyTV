import { exec } from 'child_process';
import cors from 'cors';
import express from 'express';
// Assuming 'app' is defined somewhere in your code
// const app = ...
const app = express();
const port = 3000;

app.use(cors());

runDev();

function runDev() {
  const npmCommand = 'npm run dev';

  exec(npmCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.log(stdout);
    }
  });
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});