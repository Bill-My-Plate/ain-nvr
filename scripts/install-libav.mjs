try {
  const libav = await import('@scrypted/libav');
  await libav.install();
} catch (error) {
  console.error('ain-nvr could not install the required @scrypted/libav native binary.');
  console.error(error);
  process.exitCode = 1;
}
