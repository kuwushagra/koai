
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.concurrent.Executors

@InvokeArg
internal class UriArgs {
    lateinit var uri: String
}

@InvokeArg
internal class ReadArgs {
    lateinit var uri: String
}

@InvokeArg
internal class WriteArgs {
    lateinit var uri: String
    lateinit var content: String
}

@InvokeArg
internal class CreateArgs {
    lateinit var uri: String
    lateinit var name: String
    var isDirectory: Boolean = false
}

@InvokeArg
internal class RenameArgs {
    lateinit var uri: String
    lateinit var newName: String
}

@InvokeArg
internal class DeleteArgs {
    lateinit var uri: String
}

@TauriPlugin
class SafPlugin(private val activity: Activity) : Plugin(activity) {

    private val executor = Executors.newSingleThreadExecutor()

    private fun runIo(invoke: Invoke, action: () -> Any?) {
        executor.execute {
            try {
                invoke.resolve(action())
            } catch (e: Exception) {
                invoke.reject(e.message ?: "Storage operation failed")
            }
        }
    }

    private fun documentUri(value: String): Uri {
        val uri = Uri.parse(value)

        return if (DocumentsContract.isDocumentUri(activity, uri)) {
            uri
        } else {
            DocumentsContract.buildDocumentUriUsingTree(
                uri,
                DocumentsContract.getTreeDocumentId(uri)
            )
        }
    }

    private fun mimeType(uri: Uri): String {
        val cursor = activity.contentResolver.query(
            uri,
            arrayOf(Document.COLUMN_MIME_TYPE),
            null,
            null,
            null
        ) ?: throw Exception("Unable to inspect document")

        cursor.use {
            if (!it.moveToFirst()) {
                throw Exception("Document not found")
            }

            return it.getString(0)
        }
    }

    @Command
    fun pickFolder(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
            )
        }

        startActivityForResult(invoke, intent, "onFolderPicked")
    }

    @ActivityCallback
    private fun onFolderPicked(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) {
            invoke.reject("Folder selection cancelled")
            return
        }

        val uri = result.data?.data

        if (uri == null) {
            invoke.reject("No folder was selected")
            return
        }

        try {
            val flags = result.data?.flags ?: 0

            activity.contentResolver.takePersistableUriPermission(
                uri,
                flags and (
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                )
            )

            val response = JSObject()
            response.put("uri", uri.toString())
            response.put("name", uri.lastPathSegment ?: "Folder")

            invoke.resolve(response)
        } catch (e: Exception) {
            invoke.reject(e.message ?: "Could not retain folder permission")
        }
    }

    @Command
    fun listDirectory(invoke: Invoke) {
        val args = invoke.parseArgs(UriArgs::class.java)

        runIo(invoke) {
            val parentUri = Uri.parse(args.uri)
            val parentId = if (
                DocumentsContract.isDocumentUri(activity, parentUri)
            ) {
                DocumentsContract.getDocumentId(parentUri)
            } else {
                DocumentsContract.getTreeDocumentId(parentUri)
            }

            val childrenUri =
                DocumentsContract.buildChildDocumentsUriUsingTree(
                    parentUri,
                    parentId
                )

            val cursor = activity.contentResolver.query(
                childrenUri,
                arrayOf(
                    Document.COLUMN_DOCUMENT_ID,
                    Document.COLUMN_DISPLAY_NAME,
                    Document.COLUMN_MIME_TYPE
                ),
                null,
                null,
                null
            ) ?: throw Exception("Unable to list folder")

            val entries = JSArray()

            cursor.use {
                while (it.moveToNext()) {
                    val id = it.getString(0)
                    val name = it.getString(1)
                    val mime = it.getString(2)

                    val path = DocumentsContract.buildDocumentUriUsingTree(
                        parentUri,
                        id
                    )

                    val entry = JSObject()
                    entry.put("name", name)
                    entry.put("path", path.toString())
                    entry.put("isDir", mime == Document.MIME_TYPE_DIR)

                    entries.put(entry)
                }
            }

            entries
        }
    }

    @Command
    fun readFile(invoke: Invoke) {
        val args = invoke.parseArgs(ReadArgs::class.java)

        runIo(invoke) {
            val uri = documentUri(args.uri)

            activity.contentResolver.openInputStream(uri)
                ?.bufferedReader()
                ?.use { it.readText() }
                ?: throw Exception("Unable to read file")
        }
    }

    @Command
    fun writeFile(invoke: Invoke) {
        val args = invoke.parseArgs(WriteArgs::class.java)

        runIo(invoke) {
            val uri = documentUri(args.uri)

            activity.contentResolver.openOutputStream(uri, "wt")
                ?.bufferedWriter()
                ?.use { it.write(args.content) }
                ?: throw Exception("Unable to write file")

            null
        }
    }

    @Command
    fun createEntry(invoke: Invoke) {
        val args = invoke.parseArgs(CreateArgs::class.java)

        runIo(invoke) {
            val parent = documentUri(args.uri)

            val mime = if (args.isDirectory) {
                Document.MIME_TYPE_DIR
            } else {
                "text/plain"
            }

            val created = DocumentsContract.createDocument(
                activity.contentResolver,
                parent,
                mime,
                args.name
            ) ?: throw Exception("Unable to create item")

            created.toString()
        }
    }

    @Command
    fun renameEntry(invoke: Invoke) {
        val args = invoke.parseArgs(RenameArgs::class.java)

        runIo(invoke) {
            val renamed = DocumentsContract.renameDocument(
                activity.contentResolver,
                documentUri(args.uri),
                args.newName
            ) ?: throw Exception("Unable to rename item")

            renamed.toString()
        }
    }

    @Command
    fun deleteEntry(invoke: Invoke) {
        val args = invoke.parseArgs(DeleteArgs::class.java)

        runIo(invoke) {
            val deleted = DocumentsContract.deleteDocument(
                activity.contentResolver,
                documentUri(args.uri)
            )

            if (!deleted) {
                throw Exception("Unable to delete item")
            }

            null
        }
    }
}