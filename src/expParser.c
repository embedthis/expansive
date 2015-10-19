/*
    ExpTemplate.c - Expansive template parser

    Convert an EXP web page into Ejscript
    Directives:


        <@ @>               Begin inline Ejscript code
        <@= @>              Begin inline C expression
        @=expr, @={expr}    Expression
        @~                  Home

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

/********************************** Includes **********************************/

#include    "ejs.h"
#include    "expansive.h"

/*
      EXP lexical analyser tokens
 */
#define EXP_TOK_ERR            -1            /* Any input error */
#define EXP_TOK_EOF             0            /* End of file */
#define EXP_TOK_CODE            1            /* <@ text @> */
#define EXP_TOK_VAR             2            /* @=var */
#define EXP_TOK_HOME            3            /* @~ */
#define EXP_TOK_LITERAL         4            /* literal HTML */
#define EXP_TOK_EXPR            5            /* <@= expression @> */

#define EXP_CHARS               "<@@>" 

/*
    EXP page parser structure
 */
typedef struct ExpState {
    char    *data;                          /* Input data to parse */
    char    *next;                          /* Next character in input */
    int     lineNumber;                     /* Line number for error reporting */
    cchar   *delims;                        /* Delimiter characters */
    MprBuf  *token;                         /* Input token */
} ExpState;

/************************************ Forwards ********************************/

static bool addChar(ExpState *state, int c);
static char *buildScript(Ejs *ejs, cchar *contents, cchar *delims);
static char *eatNewLine(ExpState *parse, char *next);
static char *eatSpace(ExpState *state, char *next);
static int  getToken(Ejs *ejs, ExpState *state);

/************************************* Code ***********************************/
/*
    parse(script: String, delims: String = '<@@>'): String
 */
static EjsString *parse(Ejs *ejs, EjsObj *template, int argc, EjsObj **argv)
{
    EjsString   *sp, *dp;
    cchar       *code, *delims;

    sp = (EjsString*) argv[0];
    delims = EXP_CHARS;
    if (argc >= 2) {
        dp = (EjsString*) ejsToString(ejs, argv[1]);
        if (dp->length >= 4) {
            delims = dp->value;
        }
    }
    if ((code = buildScript(ejs, sp->value, delims)) == 0) {
        if (!ejs->exception) {
            ejsThrowError(ejs, "Cannot parse script");
        }
    }
    return ejsCreateStringFromAsc(ejs, code);
}


static char *buildScript(Ejs *ejs, cchar *contents, cchar *delims)
{
    ExpState    state;
    MprBuf      *body;
    char        *token;
    int         tid;

    body = mprCreateBuf(0, 0);
    memset(&state, 0, sizeof(ExpState));
    state.next = state.data = (char*) contents;
    state.lineNumber = 0;
    state.token = mprCreateBuf(0, 0);
    state.delims = delims;
    tid = getToken(ejs, &state);

    mprPutStringToBuf(body, "global._exp_parser_ = function() { ");

    while (tid != EXP_TOK_EOF) {
        token = mprGetBufStart(state.token);
        switch (tid) {
        case EXP_TOK_CODE:
            /* <@ expr @> */
            mprPutStringToBuf(body, token);
            mprPutCharToBuf(body, ';');
            break;

        case EXP_TOK_ERR:
            return 0;

        case EXP_TOK_EXPR:
            /* <@= expr @> */
            token = strim(token, " \t\r\n;", MPR_TRIM_BOTH);
            mprPutToBuf(body, "  write('' + (%s));\n", token);
            break;

        case EXP_TOK_VAR:
            /* @=expression -- string variable */
            token = strim(token, " \t\r\n;", MPR_TRIM_BOTH);
            mprPutToBuf(body, "  write('' + (%s));\n", token);
            break;

        case EXP_TOK_HOME:
            /* @~ -- home url */
            if (state.next[0] && state.next[0] != '/' && state.next[0] != '\'' && state.next[0] != '"') {
                ejsThrowError(ejs, "Using @~ without following /");
                return 0;
            }
            token = strim(token, " \t\r\n;", MPR_TRIM_BOTH);
            mprPutToBuf(body, "  write('' + (top));\n", token);
            break;

        case EXP_TOK_LITERAL:
            mprPutToBuf(body, "  write(\"%s\");\n", token);
            break;

        default:
            return 0;
        }
        tid = getToken(ejs, &state);
    }
    mprPutStringToBuf(body, "}\n");
    mprAddNullToBuf(body);
    return mprGetBufStart(body);
}


/*
    Get the next EXP input token. input points to the next input token.
    state->token will hold the parsed token. The function returns the token id.
 */
static int getToken(Ejs *ejs, ExpState *state)
{
    char    *start, *end, *next;
    int     tid, done, c, t;

    start = next = state->next;
    end = &start[slen(start)];
    mprFlushBuf(state->token);
    tid = EXP_TOK_LITERAL;

    for (done = 0; !done && next < end; next++) {
        c = *next;
        if (c == state->delims[0]) {
            if (next[1] == state->delims[1] && ((next == start) || next[-1] != '\\' || next[-1] == '@')) {
                next += 2;
                if (mprGetBufLength(state->token) > 0) {
                    next -= 3;
                } else {
                    next = eatSpace(state, next);
                    if (*next == '=') {
                        /*
                            <@= directive
                         */
                        tid = EXP_TOK_EXPR;
                        next = eatSpace(state, ++next);
                        while (next < end && !(*next == state->delims[2] && next[1] == state->delims[3] && next[-1] != '\\')) {
                            if (*next == '\n') state->lineNumber++;
                            if (!addChar(state, *next++)) {
                                return EXP_TOK_ERR;
                            }
                        }

                    } else {
                        tid = EXP_TOK_CODE;
                        while (next < end && !(*next == state->delims[2] && next[1] == state->delims[3] && next[-1] != '\\')) {
                            if (*next == '\n') state->lineNumber++;
                            if (!addChar(state, *next++)) {
                                return EXP_TOK_ERR;
                            }
                        }
                    }
                    if (*next && next > start && next[-1] == '-') {
                        /* Remove "-" */
                        mprAdjustBufEnd(state->token, -1);
                        mprAddNullToBuf(state->token);
                        next = eatNewLine(state, next + 2) - 1;
                    } else {
                        next++;
                    }
                }
                done++;
            } else {
                if (!addChar(state, c)) {
                    return EXP_TOK_ERR;
                }                
            }
        } else if (c == state->delims[1]) {
            if ((next == start) || next[-1] != '\\') {
                t = next[1];
                if (t == '~') {
                    next += 2;
                    if (mprGetBufLength(state->token) > 0) {
                        /* Prior literal */
                        next -= 3;
                    } else {
                        tid = EXP_TOK_HOME;
                        if (!addChar(state, c)) {
                            return EXP_TOK_ERR;
                        }
                        next--;
                    }
                    done++;

                } else if (t == '=') {
                    /* @=var */
                    next += 2;
                    if (mprGetBufLength(state->token) > 0) {
                        /* Prior literal */
                        next -= 3;
                    } else {
                        tid = EXP_TOK_VAR;
                        next = eatSpace(state, next);
                        if (*next == '{') {
                            next++;
                            while (*next && *next != '}') {
                                if (*next == '\n') state->lineNumber++;
                                if (!addChar(state, *next++)) {
                                    return EXP_TOK_ERR;
                                }
                            }
                            /* Comment to balance braces '{' */
                            if (*next == '}') {
                                next++;
                            }
                        } else {
                            while (isalnum((uchar) *next) || *next == '_' || *next == '[' || *next == ']' || *next == '.' ||
                                    *next == '$' || *next == '_') {
                                if (*next == '\n') state->lineNumber++;
                                if (!addChar(state, *next++)) {
                                    return EXP_TOK_ERR;
                                }
                            }
                        }
                        next--;
                    }
                    done++;

                } else {
                    if (!addChar(state, c)) {
                        return EXP_TOK_ERR;
                    }
                    done++;
                }
            } else {
                if (!addChar(state, c)) {
                    return EXP_TOK_ERR;
                }
            }

        } else {
            if (c == '\n') {
                state->lineNumber++;
            }
            if (c == '\\' && next[1] == '@' && next[2] == '@') {
                c = *++next;
            } else if (c == '\"' || c == '\\') {
                if (!addChar(state, '\\')) {
                    return EXP_TOK_ERR;
                }
            }
            if (!addChar(state, c)) {
                return EXP_TOK_ERR;
            }
        }
    }
    if (mprGetBufLength(state->token) == 0) {
        tid = EXP_TOK_EOF;
    }
    state->next = next;
    return tid;
}


static bool addChar(ExpState *state, int c)
{
    if (mprPutCharToBuf(state->token, c) < 0) {
        return 0;
    }
    mprAddNullToBuf(state->token);
    return 1;
}


static char *eatSpace(ExpState *state, char *next)
{
    for (; *next && isspace((uchar) *next); next++) {
        if (*next == '\n') {
            state->lineNumber++;
        }
    }
    return next;
}


static char *eatNewLine(ExpState *state, char *next)
{
    for (; *next && isspace((uchar) *next); next++) {
        if (*next == '\n') {
            state->lineNumber++;
            next++;
            break;
        }
    }
    return next;
}


PUBLIC int expansiveConfigureTemplateType(Ejs *ejs)
{
    EjsType     *type;
    EjsPot      *prototype;

    /*
        Get the Square class object. This will be created from the mod file for us.
     */
    if ((type = ejsGetTypeByName(ejs, N("expansive.template", "ExpansiveParser"))) == 0) {
        mprError("Cannot find type ExpansiveParser");
        return MPR_ERR;
    }
    prototype = type->prototype;
    ejsBindMethod(ejs, prototype, ES_ExpansiveParser_parse, parse);
    return 0;
}


/*
    @copy   default

    Copyright (c) Embedthis Software LLC, 2003-2014. All Rights Reserved.

    This software is distributed under commercial and open source licenses.
    You may use the Embedthis Open Source license or you may acquire a 
    commercial license from Embedthis Software. You agree to be fully bound
    by the terms of either license. Consult the LICENSE.md distributed with
    this software for full details and other copyrights.

    Local variables:
    tab-width: 4
    c-basic-offset: 4
    End:
    vim: sw=4 ts=4 expandtab

    @end
 */
