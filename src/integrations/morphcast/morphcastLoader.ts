const loadedScripts = new Set<string>();

export const loadMorphCastScript = async (scriptUrl: string) => {
  if (loadedScripts.has(scriptUrl)) return;
  if (document.querySelector(`script[data-morphcast-sdk="${scriptUrl}"]`)) {
    loadedScripts.add(scriptUrl);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.dataset.morphcastSdk = scriptUrl;
    script.onload = () => {
      loadedScripts.add(scriptUrl);
      resolve();
    };
    script.onerror = () => reject(new Error("MorphCast SDK script yuklenemedi."));
    document.head.appendChild(script);
  });
};
