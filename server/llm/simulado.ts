import { LlmError, type LlmErrorKind, type LlmRequest, type LlmResult, type Provider } from './types.ts';

// Proveedor de prueba: no llama a nadie ni cuesta nada. Sirve para probar todo el circuito.
// SIMULADO_FALLO=cuota (u otro tipo de error) hace que todas las llamadas fallen así.

export function simuladoProvider(): Provider {
  return {
    name: 'simulado',
    defaultModel: 'simulado',
    async complete(req: LlmRequest, model: string): Promise<LlmResult> {
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2500));
      const fail = process.env.SIMULADO_FALLO as LlmErrorKind | undefined;
      if (fail) throw new LlmError(fail, `simulado: fallo forzado (${fail})`);
      const text =
        req.fake?.() ??
        `# Respuesta de prueba\n\nEsta respuesta la ha generado el proveedor **simulado**, sin IA real.\n\n- Pon una clave en \`.env\` para usar una IA de verdad.\n- Tipo de petición: ${req.purpose}.`;
      const promptChars = req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0);
      return { text, model, inputTokens: Math.ceil(promptChars / 4), outputTokens: Math.ceil(text.length / 4) };
    },
  };
}
