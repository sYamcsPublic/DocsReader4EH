import { useEffect } from 'react';

function App() {
  useEffect(() => {
    console.log(`[evenhub.App.tsx]useEffect start`);
    console.log(`[evenhub.App.tsx]window.location:${JSON.stringify(window.location)}`);

    const pwaURL = 'https://docsreader4eh.syamcspublic.workers.dev';

    const isLocalPort = window.location.port === '5173';
    const isTargetDomain = window.location.href.startsWith(pwaURL);

    console.log(`[evenhub.App.tsx]isLocalPort:${isLocalPort}`);
    if (isLocalPort) {
      const newUrl = new URL(window.location.href);
      const newPort = '5174';
      newUrl.port = newPort;
      newUrl.searchParams.set('mode', 'evenhub');
      window.location.href = newUrl.toString();
      return;
    }

    console.log(`[evenhub.App.tsx]isTargetDomain:${isTargetDomain}`);
    if (!isTargetDomain) {
      const additionalParam = 'mode=evenhub';
      const separator = window.location.search ? '&' : '?';
      window.location.href = pwaURL + window.location.search + separator + additionalParam;
      return;
    }

    console.log(`[evenhub.App.tsx]useEffect end`);
  }, []);
  return <></>
}

export default App;
