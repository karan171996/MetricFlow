import pkg from '../../../package.json' with { type: 'json' };

export async function GET() {
    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: pkg.version
    });
  }
