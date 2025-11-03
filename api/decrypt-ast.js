import crypto from 'crypto';
import * as ts from 'typescript';  // Import TS compiler buat extend deserializer nanti

export default async function handler(req, res) {
  // Cek method: Hanya POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Gunakan POST.' });
  }

  // Ambil input dari body JSON
  const { keyHex, ivHex, ciphertextB64 } = req.body;

  // Validasi input
  if (!keyHex || !ivHex || !ciphertextB64) {
    return res.status(400).json({ 
      error: 'Missing parameters. Butuh: keyHex, ivHex, ciphertextB64' 
    });
  }

  try {
    // Convert hex ke Buffer
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    // Buat decipher AES-256-CBC
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.finalize()]);

    // Unpad PKCS7 manual (Node.js crypto ga auto-unpad)
    const paddingLength = decrypted[decrypted.length - 1];
    if (paddingLength < 1 || paddingLength > 16) {
      throw new Error('Invalid padding');
    }
    const unpadded = decrypted.slice(0, -paddingLength);
    const decryptedAst = unpadded.toString('utf-8');

    // Contoh reconstructed code dari AST (dari ts-ast-viewer; full-nya kompleks)
    // Kamu bisa extend dengan deserializer full dari repo ts-ast-viewer
    const reconstructedCode = `
// Rekonstruksi sederhana dari AST serialized (full-nya buka viewerUrl di response)
// Interface dan event handler untuk handle message decrypt
interface Payload {
  type: 'send';
  payload: string;
}

const handleMessage = (message: Payload): string | null => {
  if (message.type === 'send') {
    // Extract IV dari payload (contoh: slice 0-32 chars)
    const iv = message.payload.slice(0, 32);
    const key = Buffer.from('4c78bda5675779040a2513e55359da9dc2f62a66c8ba2fd7c3e418f7b6aefd47', 'hex');
    const cipherText = Buffer.from(message.payload, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(cipherText);
    decrypted = Buffer.concat([decrypted, decipher.finalize()]);
    
    // Unpad mirip di atas
    const padLen = decrypted[decrypted.length - 1];
    const unpadded = decrypted.slice(0, -padLen);
    return unpadded.toString('utf8');
  }
  return null;
};

// Event handler untuk window.message
const eventHandler = (event: MessageEvent) => {
  const data = event.data as Payload;
  const result = handleMessage(data);
  if (result) {
    console.log('Decrypted AST processed:', result);
    // Di sini bisa parse AST lebih lanjut, e.g., ts.createSourceFile(result, ...)
  }
};

// Setup listener
if (typeof window !== 'undefined') {
  window.addEventListener('message', eventHandler, false);
}

// Factory example buat generate AST baru (optional)
import * as tsFactory from 'typescript';
const factory = tsFactory.factory;
const sourceFile = factory.createSourceFile(
  ['temp.ts'],
  factory.createExpressionStatement(
    factory.createCallExpression(
      factory.createIdentifier('console.log'),
      undefined,
      [factory.createStringLiteral('Hello from AST!')]
    )
  ),
  ts.NodeFlags.None
);
console.log('SourceFile created:', sourceFile);
`.trim();

    // Buat URL viewer buat reconstructed full
    const viewerUrl = `https://ts-ast-viewer.com/#code/${encodeURIComponent(decryptedAst)}`;

    // Response JSON
    res.status(200).json({
      success: true,
      decryptedAst: decryptedAst,  // Raw AST string (panjang)
      reconstructedCode: reconstructedCode,  // Contoh code TS/JS
      viewerUrl: viewerUrl,  // Link buat buka full reconstructed di browser
      message: 'Decrypt sukses! Paste decryptedAst ke ts-ast-viewer buat lihat tree.'
    });

  } catch (error) {
    console.error('Decrypt error:', error);
    res.status(500).json({ 
      error: 'Decrypt gagal', 
      details: error.message 
    });
  }
}

// Config Vercel: Max body size & runtime
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'  // Buat ciphertext besar
    }
  }
};
