import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GraphQLModule } from '@nestjs/graphql';
import { IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import { ConfigModule } from '@nestjs/config';
import { ApolloGatewayDriver, ApolloGatewayDriverConfig } from '@nestjs/apollo';
import { GatewayContext } from './common/interface/gateway-context.interface';
import { MyJwtPayload } from './common/interface/jwt.interface';
import * as jwt from 'jsonwebtoken';
import { IncomingHttpHeaders } from 'http';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    GraphQLModule.forRoot<ApolloGatewayDriverConfig>({
      driver: ApolloGatewayDriver,
      server: {
        context: ({ req }: { req: { headers: IncomingHttpHeaders } }) => {
          const authHeader = req.headers.authorization;
          const token =
            typeof authHeader === 'string'
              ? authHeader.split(' ')[1]
              : undefined;

          if (!token) {
            return { authState: 'ANONYMOUS' };
          }

          try {
            const secret = process.env.JWT_SECRET;
            if (!secret) {
              return { authState: 'ERROR' };
            }

            const decoded = jwt.verify(
              token,
              secret,
            ) as unknown as MyJwtPayload;

            return {
              userId: decoded.sub,
              userRole: decoded.role,
              userEmail: decoded.email,
              userPseudo: decoded.pseudo,
              userAge: decoded.age,
              authState: 'VALID',
            };
          } catch {
            return { authState: 'INVALID_TOKEN' };
          }
        },
      },
      gateway: {
        supergraphSdl: new IntrospectAndCompose({
          subgraphs: [
            // { name: 'auth', url: 'http://localhost:3000/graphql' },
            { name: 'user', url: 'http://localhost:3001/graphql' },
          ],
        }),
        buildService({ url }) {
          return new RemoteGraphQLDataSource({
            url,
            willSendRequest({ request, context }) {
              const ctx = context as GatewayContext;

              if (request.http) {
                request.http.headers.set(
                  'x-auth-state',
                  ctx.authState ?? 'ANONYMOUS',
                );

                if (ctx.authState === 'VALID' && ctx.userId) {
                  request.http.headers.set('x-user-id', String(ctx.userId));
                  request.http.headers.set('x-user-role', String(ctx.userRole));
                  request.http.headers.set(
                    'x-user-email',
                    String(ctx.userEmail),
                  );
                  request.http.headers.set(
                    'x-user-pseudo',
                    String(ctx.userPseudo),
                  );
                  request.http.headers.set('x-user-age', String(ctx.userAge));
                }
              }
            },
          });
        },
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
