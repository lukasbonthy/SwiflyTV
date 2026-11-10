import React, {useLayoutEffect} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {PageContent} from './document.mjs';
import {startControllers} from './controllers.mjs';
import './rails.css';

const model=JSON.parse(document.getElementById('swifly-react-data').textContent);
function App(){
  useLayoutEffect(()=>{void startControllers(model.scripts);},[]);
  return <PageContent model={model}/>;
}

hydrateRoot(document.body,<App/>,{
  onRecoverableError(error){
    console.error('[Swifly React hydration]',error);
    (window.__swiflyReactErrors||=[]).push(String(error));
  },
});
