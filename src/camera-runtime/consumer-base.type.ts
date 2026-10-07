





import { deferred } from './deferred.util.js';


export type ConsumerBase = {
  id: string;
  active: boolean;
  completion: ReturnType<typeof deferred<void>>;
  stopping?: Promise<void>;
};
