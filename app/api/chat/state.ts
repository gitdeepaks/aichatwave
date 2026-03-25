import {
  StateSchema,
  MessagesValue,
} from '@langchain/langgraph';
import { z } from 'zod'

export const MessagesState = new StateSchema({
  messages: MessagesValue,

})
